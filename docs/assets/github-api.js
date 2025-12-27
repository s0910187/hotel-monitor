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
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `GitHub API Error: ${response.status}`);
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
            const content = atob(data.content.replace(/\n/g, ''));
            return {
                content: JSON.parse(content),
                sha: data.sha
            };
        } catch (error) {
            console.error(`讀取檔案失敗 (${path}):`, error);
            throw error;
        }
    }

    async updateFile(path, content, message, sha) {
        try {
            const data = await this._request('PUT', `/repos/${this.owner}/${this.repo}/contents/${path}`, {
                message: message,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
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
            console.error('觸發 Workflow 失敗:', error);
            throw error;
        }
    }

    async getWorkflowRuns(limit = 5) {
        try {
            const data = await this._request('GET', `/repos/${this.owner}/${this.repo}/actions/runs?per_page=${limit}`);
            return data.workflow_runs;
        } catch (error) {
            console.error('取得 Workflow 執行記錄失敗:', error);
            throw error;
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
