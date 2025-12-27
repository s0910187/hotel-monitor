// GitHub API 整合模組
class GitHubAPI {
    constructor() {
        this.octokit = null;
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
        this.octokit = new Octokit.Octokit({ auth: token });
    }

    isConfigured() {
        return !!this.octokit;
    }

    async testConnection() {
        try {
            await this.octokit.rest.repos.get({
                owner: this.owner,
                repo: this.repo
            });
            return true;
        } catch (error) {
            console.error('連線測試失敗:', error);
            return false;
        }
    }

    async getFileContent(path) {
        try {
            const response = await this.octokit.rest.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path: path
            });

            const content = atob(response.data.content);
            return {
                content: JSON.parse(content),
                sha: response.data.sha
            };
        } catch (error) {
            console.error(`讀取檔案失敗 (${path}):`, error);
            throw error;
        }
    }

    async updateFile(path, content, message, sha) {
        try {
            const response = await this.octokit.rest.repos.createOrUpdateFileContents({
                owner: this.owner,
                repo: this.repo,
                path: path,
                message: message,
                content: btoa(JSON.stringify(content, null, 2)),
                sha: sha
            });
            return response.data;
        } catch (error) {
            console.error(`更新檔案失敗 (${path}):`, error);
            throw error;
        }
    }

    async triggerWorkflow() {
        try {
            await this.octokit.rest.actions.createWorkflowDispatch({
                owner: this.owner,
                repo: this.repo,
                workflow_id: 'hotel-monitor.yml',
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
            const response = await this.octokit.rest.actions.listWorkflowRunsForRepo({
                owner: this.owner,
                repo: this.repo,
                per_page: limit
            });
            return response.data.workflow_runs;
        } catch (error) {
            console.error('取得 Workflow 執行記錄失敗:', error);
            throw error;
        }
    }

    async getRunStatus(runId) {
        try {
            const response = await this.octokit.rest.actions.getWorkflowRun({
                owner: this.owner,
                repo: this.repo,
                run_id: runId
            });
            return response.data;
        } catch (error) {
            console.error('取得執行狀態失敗:', error);
            throw error;
        }
    }
}

// 匯出供 app.js 使用
window.GitHubAPI = GitHubAPI;
