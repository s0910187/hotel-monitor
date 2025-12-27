// GitHub API 整合模組（使用原生 fetch API）
class GitHubAPI {
    constructor() {
        this.token = null;
        this.owner = null;
        this.repo = null;
        this.config = this.loadConfig();

        if (this.config.token) {
            this.initialize(this.config.owner, this.config.repo, this.config.token);
        }
    }

    loadConfig() {
        const saved = localStorage.getItem('github_config');
        return saved ? JSON.parse(saved) : {};
    }

    saveConfig(owner, repo, token) {
        const config = { owner, repo, token };
        localStorage.setItem('github_config', JSON.stringify(config));
        this.config = config;
    }

    initialize(owner, repo, token) {
        this.owner = owner;
        this.repo = repo;
        this.token = token;
    }

    isConfigured() {
        return !!this.token;
    }

    async _request(method, endpoint, body = null) {
        if (!this.token) throw new Error('尚未設定 GitHub Token');

        const url = `https://api.github.com${endpoint}`;
        const headers = {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };

        const options = {
            method,
            headers
        };

        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            // 對於 404 錯誤，如果是取得檔案，可能只是檔案不存在，可以在上層處理
            if (response.status === 404) {
                throw new Error('Not Found');
            }
            if (response.status === 403) {
                throw new Error('Forbidden: 權限不足或 API 速率限制');
            }
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `GitHub API Error: ${response.status}`);
        }

        // 某些 API 回應 204 No Content，不需要解析 JSON
        if (response.status === 204) {
            return true;
        }

        return response.json();
    }

    async testConnection() {
        try {
            await this._request('GET', `/repos/${this.owner}/${this.repo}`);
            return true;
        } catch (error) {
            console.error('連線測試失敗:', error);
            return false;
        }
    }

    async getFileContent(path) {
        try {
            const data = await this._request('GET', `/repos/${this.owner}/${this.repo}/contents/${path}`);

            // 修正 UTF-8 中文亂碼問題
            // atob 只能處理 Latin-1，需使用 escape/decodeURIComponent 正確處理 UTF-8 多字節字符
            const rawContent = data.content.replace(/\n/g, '');
            const decodedContent = decodeURIComponent(escape(atob(rawContent)));

            return {
                content: JSON.parse(decodedContent),
                sha: data.sha
            };
        } catch (error) {
            if (error.message === 'Not Found') {
                console.warn(`檔案不存在 (${path})，這可能是正常的初次狀態。`);
                throw error; // 拋出讓上層決定如何處理（例如回傳預設值）
            }
            console.error(`讀取檔案失敗 (${path}):`, error);
            throw error;
        }
    }

    async updateFile(path, content, message, sha) {
        try {
            // 修正 UTF-8 中文編碼問題
            const contentString = JSON.stringify(content, null, 2);
            // 使用 encodeURIComponent/unescape/btoa 正確編碼 UTF-8
            const encodedContent = btoa(unescape(encodeURIComponent(contentString)));

            const data = await this._request('PUT', `/repos/${this.owner}/${this.repo}/contents/${path}`, {
                message: message,
                content: encodedContent,
                sha: sha
            });
            return data;
        } catch (error) {
            console.error(`更新檔案失敗 (${path}):`, error);
            throw error;
        }
    }

    async triggerWorkflow() {
        try {
            await this._request('POST', `/repos/${this.owner}/${this.repo}/actions/workflows/hotel-monitor.yml/dispatches`, {
                ref: 'main'
            });
            return true;
        } catch (error) {
            if (error.message.includes('Forbidden') || error.message.includes('Must have admin rights')) {
                throw new Error('Token 權限不足。請確認您的 Token 具有 "workflow" 權限，且是一個 Classic Token。');
            }
            console.error('觸發 Workflow 失敗:', error);
            throw error;
        }
    }

    async getWorkflowRuns(limit = 5) {
        try {
            const data = await this._request('GET', `/repos/${this.owner}/${this.repo}/actions/runs?per_page=${limit}`);
            return data.workflow_runs;
        } catch (error) {
            // 忽略 404 或其他非致命錯誤
            console.warn('取得 Workflow 執行記錄失敗:', error);
            return [];
        }
    }

    async getRunStatus(runId) {
        try {
            const data = await this._request('GET', `/repos/${this.owner}/${this.repo}/actions/runs/${runId}`);
            return data;
        } catch (error) {
            console.error('取得執行狀態失敗:', error);
            throw error;
        }
    }
}

// 匯出供 app.js 使用
window.GitHubAPI = GitHubAPI;
