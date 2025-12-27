// 主應用程式
const app = {
    api: null,
    lastState: null,
    config: null,
    chart: null,

    async init() {
        this.api = new GitHubAPI();

        // 檢查是否已設定
        if (!this.api.isConfigured()) {
            this.showSetup();
        } else {
            await this.loadData();
        }

        // 綁定事件
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('saveTokenBtn')?.addEventListener('click', () => this.saveToken());
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.loadData());
        document.getElementById('manualRunBtn')?.addEventListener('click', () => this.triggerRun());
    },

    showSetup() {
        document.getElementById('loadingSpinner').classList.add('hidden');
        document.getElementById('setupSection').classList.remove('hidden');
    },

    showDashboard() {
        document.getElementById('setupSection').classList.add('hidden');
        document.getElementById('loadingSpinner').classList.add('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
    },

    async saveToken() {
        const owner = document.getElementById('ownerInput').value.trim();
        const repo = document.getElementById('repoInput').value.trim();
        const token = document.getElementById('tokenInput').value.trim();

        if (!owner || !repo || !token) {
            this.showToast('請填寫所有欄位', 'error');
            return;
        }

        this.api.saveConfig(owner, repo, token);
        this.api.initialize(owner, repo, token);

        // 測試連線
        const isValid = await this.api.testConnection();
        if (isValid) {
            this.showToast('設定儲存成功！', 'success');
            await this.loadData();
        } else {
            this.showToast('Token 驗證失敗，請檢查設定', 'error');
        }
    },

    async loadData() {
        try {
            document.getElementById('loadingSpinner').classList.remove('hidden');

            // 讀取 config.json 和 last_state.json
            const [configData, stateData] = await Promise.all([
                this.api.getFileContent('config.json'),
                this.api.getFileContent('last_state.json').catch(() => ({ content: {}, sha: null }))
            ]);

            this.config = configData;
            this.lastState = stateData.content;

            this.renderDashboard();
            this.renderConfigForm();
            this.showDashboard();
        } catch (error) {
            console.error('載入資料失敗:', error);
            this.showToast('載入資料失敗: ' + error.message, 'error');
        }
    },

    renderDashboard() {
        // 渲染狀態卡片
        const cardsContainer = document.getElementById('statusCards');
        cardsContainer.innerHTML = '';

        const dates = Object.keys(this.lastState);
        if (dates.length === 0) {
            cardsContainer.innerHTML = '<p class="text-gray-500">尚無監控資料，請先執行一次查詢。</p>';
            return;
        }

        dates.forEach(date => {
            const info = this.lastState[date];
            const card = this.createPriceCard(date, info);
            cardsContainer.appendChild(card);
        });

        // 渲染趨勢圖
        this.renderChart();
    },

    createPriceCard(date, info) {
        const div = document.createElement('div');
        div.className = 'bg-white rounded-lg shadow-md p-6';

        const isAvailable = info.isAvailable;
        const statusColor = isAvailable ? 'text-green-600' : 'text-red-600';
        const statusIcon = isAvailable ? '✅' : '❌';
        const statusText = isAvailable ? '有空房' : '滿房';

        const currencySymbol = info.currency === 'JPY' ? '¥' : (info.currency === 'TWD' ? 'NT$' : '');
        const priceText = info.price ? `${currencySymbol}${info.price.toLocaleString()}` : '未知';

        div.innerHTML = `
            <div class="text-sm text-gray-500 mb-2">📅 ${date}</div>
            <div class="text-2xl font-bold ${statusColor} mb-2">${statusIcon} ${statusText}</div>
            <div class="text-xl font-semibold text-gray-800">${priceText}</div>
        `;

        return div;
    },

    renderChart() {
        const ctx = document.getElementById('priceChart');
        if (!ctx) return;

        const dates = Object.keys(this.lastState).sort();
        const prices = dates.map(date => this.lastState[date].price || null);

        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: '房價 (¥)',
                    data: prices,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    },

    renderConfigForm() {
        const form = document.getElementById('configForm');
        if (!form || !this.config) return;

        form.innerHTML = `
            <div>
                <label class="block text-sm font-medium mb-2">監控日期（每行一個）</label>
                <textarea id="datesInput" rows="5" class="w-full px-3 py-2 border rounded-lg font-mono text-sm">${this.config.content.monitoring.checkinDates.join('\n')}</textarea>
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">執行頻率 (Cron)</label>
                <input type="text" id="cronInput" value="${this.config.content.schedule.cron}" class="w-full px-3 py-2 border rounded-lg font-mono">
                <p class="text-xs text-gray-500 mt-1">目前: ${this.config.content.schedule.description || '每小時執行一次'}</p>
            </div>
            <button id="saveConfigBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">
                💾 儲存設定
            </button>
        `;

        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfig());
    },

    async saveConfig() {
        try {
            const datesText = document.getElementById('datesInput').value;
            const dates = datesText.split('\n').map(d => d.trim()).filter(d => d);
            const cron = document.getElementById('cronInput').value.trim();

            // 更新 config
            const newConfig = {
                ...this.config.content,
                monitoring: {
                    ...this.config.content.monitoring,
                    checkinDates: dates
                },
                schedule: {
                    ...this.config.content.schedule,
                    cron: cron
                }
            };

            // 推送到 GitHub
            await this.api.updateFile('config.json', newConfig, 'chore: 更新監控設定', this.config.sha);
            this.showToast('設定已儲存並推送至 GitHub', 'success');

            // 重新載入
            setTimeout(() => this.loadData(), 1000);
        } catch (error) {
            console.error('儲存設定失敗:', error);
            this.showToast('儲存失敗: ' + error.message, 'error');
        }
    },

    async triggerRun() {
        try {
            await this.api.triggerWorkflow();
            this.showToast('已觸發執行，請稍後重新整理查看結果', 'success');
        } catch (error) {
            console.error('觸發執行失敗:', error);
            this.showToast('觸發失敗: ' + error.message, 'error');
        }
    },

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500'
        };

        toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white transform transition-all duration-300 ${colors[type]}`;
        toast.textContent = message;
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.transform = 'translateY(5rem)';
            toast.style.opacity = '0';
        }, 3000);
    }
};

// 啟動應用
document.addEventListener('DOMContentLoaded', () => app.init());
