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
            cardsContainer.innerHTML = '<p class="text-gray-500 col-span-3">尚無監控資料，請點擊右上角「手動執行」進行第一次查詢。</p>';
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
        div.className = 'bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition';

        const isAvailable = info.isAvailable;
        const statusColor = isAvailable ? 'text-green-600' : 'text-red-600';
        const statusBg = isAvailable ? 'bg-green-50' : 'bg-red-50';
        const statusIcon = isAvailable ? '✅' : '❌';
        const statusText = isAvailable ? '有空房' : '滿房';

        const currencySymbol = info.currency === 'JPY' ? '¥' : (info.currency === 'TWD' ? 'NT$' : '');
        const priceText = info.price ? `${currencySymbol}${info.price.toLocaleString()}` : '未知';

        div.innerHTML = `
            <div class="text-sm text-gray-500 mb-2">📅 ${date}</div>
            <div class="text-2xl font-bold ${statusColor} mb-2 ${statusBg} px-3 py-2 rounded">${statusIcon} ${statusText}</div>
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

        const keywords = this.config.content.monitoring.roomKeywords || [];

        form.innerHTML = `
            <!-- 飯店資訊 -->
            <div class="bg-gray-50 p-6 rounded-lg mb-6 border-l-4 border-blue-500">
                <h3 class="text-lg font-bold mb-4 text-gray-800">🏨 飯店資訊</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">飯店名稱</label>
                        <input type="text" id="hotelNameInput" value="${this.config.content.hotel.name}" 
                               class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">飯店預訂網址</label>
                        <input type="url" id="hotelUrlInput" value="${this.config.content.hotel.url}" 
                               class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                        <p class="text-xs text-gray-500 mt-1">💡 例如：https://reserve.daiwaroynet.jp</p>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">飯店代碼</label>
                        <input type="text" id="hotelCodeInput" value="${this.config.content.hotel.code}" 
                               class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono text-sm">
                        <p class="text-xs text-gray-500 mt-1">💡 從預訂網址中的 code 參數取得</p>
                    </div>
                </div>
            </div>

            <!-- 監控設定 -->
            <div class="bg-gray-50 p-6 rounded-lg mb-6 border-l-4 border-green-500">
                <h3 class="text-lg font-bold mb-4 text-gray-800">📅 監控設定</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">監控日期（每行一個）</label>
                        <textarea id="datesInput" rows="6" 
                                  class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono text-sm">${this.config.content.monitoring.checkinDates.join('\n')}</textarea>
                        <p class="text-xs text-gray-500 mt-1">💡 每行輸入一個入住日期，格式：2026/04/17</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">房型關鍵字（每行一個）</label>
                        <textarea id="keywordsInput" rows="4" 
                                  class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono text-sm">${keywords.join('\n')}</textarea>
                        <p class="text-xs text-gray-500 mt-1">💡 系統會尋找包含這些關鍵字的房型（例如：四人房、4人房、クアッド）</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">入住人數</label>
                            <input type="number" id="adultsInput" value="${this.config.content.monitoring.adults}" min="1" max="10"
                                   class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">顯示幣別</label>
                            <select id="currencyInput" class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                                <option value="JPY" ${this.config.content.monitoring.currency === 'JPY' ? 'selected' : ''}>日圓 (JPY / ¥)</option>
                                <option value="TWD" ${this.config.content.monitoring.currency === 'TWD' ? 'selected' : ''}>台幣 (TWD / NT$)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 執行排程 -->
            <div class="bg-gray-50 p-6 rounded-lg mb-6 border-l-4 border-purple-500">
                <h3 class="text-lg font-bold mb-4 text-gray-800">⏰ 執行排程</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">執行頻率</label>
                        <select id="scheduleInput" class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                            <option value="0 * * * *">每小時執行一次（推薦）</option>
                            <option value="0 */2 * * *">每 2 小時執行一次</option>
                            <option value="0 */3 * * *">每 3 小時執行一次</option>
                            <option value="0 */6 * * *">每 6 小時執行一次</option>
                            <option value="0 6,18 * * *">每天 6:00 和 18:00</option>
                            <option value="0 8 * * *">每天早上 8:00</option>
                            <option value="custom">自訂 Cron 表達式...</option>
                        </select>
                        <p class="text-xs text-gray-600 mt-2 bg-blue-50 px-3 py-2 rounded" id="scheduleHint">💡 建議每小時執行一次，以便及時掌握房價變動</p>
                    </div>
                    
                    <div id="customCronDiv" class="hidden">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">自訂 Cron 表達式</label>
                        <input type="text" id="customCronInput" value="${this.config.content.schedule.cron}" 
                               class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono text-sm">
                        <p class="text-xs text-gray-500 mt-1">格式：分 時 日 月 週 | <a href="https://crontab.guru" target="_blank" class="text-blue-600 underline hover:text-blue-800">Cron 語法說明</a></p>
                    </div>
                </div>
            </div>

            <!-- 儲存按鈕 -->
            <div class="flex gap-4">
                <button id="saveConfigBtn" class="flex-1 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition font-semibold shadow-lg text-lg">
                    💾 儲存並推送到 GitHub
                </button>
                <button id="resetConfigBtn" class="px-6 py-4 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition font-semibold">
                    🔄 重置
                </button>
            </div>
        `;

        // 設定 Cron 下拉選單預設值
        const scheduleSelect = document.getElementById('scheduleInput');
        const currentCron = this.config.content.schedule.cron;
        const option = Array.from(scheduleSelect.options).find(opt => opt.value === currentCron);
        if (option) {
            scheduleSelect.value = currentCron;
        } else {
            scheduleSelect.value = 'custom';
            document.getElementById('customCronDiv').classList.remove('hidden');
            document.getElementById('customCronInput').value = currentCron;
        }

        // 監聽排程變更
        scheduleSelect.addEventListener('change', (e) => {
            const customDiv = document.getElementById('customCronDiv');
            const hint = document.getElementById('scheduleHint');
            if (e.target.value === 'custom') {
                customDiv.classList.remove('hidden');
                hint.textContent = '💡 請輸入有效的 Cron 表達式';
            } else {
                customDiv.classList.add('hidden');
                const hints = {
                    '0 * * * *': '💡 每小時整點執行，可即時掌握房價變動',
                    '0 */2 * * *': '💡 每 2 小時執行一次，平衡頻率與資源',
                    '0 */3 * * *': '💡 每 3 小時執行一次',
                    '0 */6 * * *': '💡 每 6 小時執行一次',
                    '0 6,18 * * *': '💡 每天台灣時間 6:00 和 18:00 執行',
                    '0 8 * * *': '💡 每天台灣時間早上 8:00 執行'
                };
                hint.textContent = hints[e.target.value] || '';
                hint.className = 'text-xs text-gray-600 mt-2 bg-blue-50 px-3 py-2 rounded';
            }
        });

        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfig());
        document.getElementById('resetConfigBtn').addEventListener('click', () => {
            if (confirm('確定要重置設定嗎？所有未儲存的變更將會遺失。')) {
                this.loadData();
            }
        });
    },

    async saveConfig() {
        try {
            const datesText = document.getElementById('datesInput').value;
            const dates = datesText.split('\n').map(d => d.trim()).filter(d => d);

            const keywordsText = document.getElementById('keywordsInput').value;
            const keywords = keywordsText.split('\n').map(k => k.trim()).filter(k => k);

            const scheduleSelect = document.getElementById('scheduleInput');
            const cron = scheduleSelect.value === 'custom'
                ? document.getElementById('customCronInput').value.trim()
                : scheduleSelect.value;

            // 驗證日期格式
            const dateRegex = /^\d{4}\/\d{2}\/\d{2}$/;
            const invalidDates = dates.filter(d => !dateRegex.test(d));
            if (invalidDates.length > 0) {
                this.showToast(`❌ 日期格式錯誤：${invalidDates.join(', ')}\\n請使用 YYYY/MM/DD 格式`, 'error');
                return;
            }

            // 更新 config
            const newConfig = {
                ...this.config.content,
                hotel: {
                    name: document.getElementById('hotelNameInput').value.trim(),
                    url: document.getElementById('hotelUrlInput').value.trim(),
                    code: document.getElementById('hotelCodeInput').value.trim()
                },
                monitoring: {
                    ...this.config.content.monitoring,
                    checkinDates: dates,
                    roomKeywords: keywords,
                    adults: parseInt(document.getElementById('adultsInput').value),
                    currency: document.getElementById('currencyInput').value
                },
                schedule: {
                    ...this.config.content.schedule,
                    cron: cron
                }
            };

            // 推送到 GitHub
            this.showToast('⏳ 正在儲存並推送到 GitHub...', 'info');
            await this.api.updateFile('config.json', newConfig, 'chore: 更新監控設定', this.config.sha);
            this.showToast('✅ 設定已成功儲存並推送至 GitHub！', 'success');

            // 重新載入
            setTimeout(() => this.loadData(), 1500);
        } catch (error) {
            console.error('儲存設定失敗:', error);
            this.showToast('❌ 儲存失敗: ' + error.message, 'error');
        }
    },

    async triggerRun() {
        try {
            this.showToast('⏳ 正在觸發執行...', 'info');
            await this.api.triggerWorkflow();
            this.showToast('✅ 已成功觸發執行！請等待 2-3 分鐘後點擊「重新整理」查看結果', 'success');
        } catch (error) {
            console.error('觸發執行失敗:', error);
            this.showToast('❌ 觸發失敗: ' + error.message, 'error');
        }
    },

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            info: 'bg-blue-600'
        };

        toast.className = `fixed bottom-4 right-4 px-6 py-4 rounded-lg shadow-2xl text-white transform transition-all duration-300 ${colors[type]}`;
        toast.textContent = message;
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.transform = 'translateY(5rem)';
            toast.style.opacity = '0';
        }, 4000);
    }
};

// 啟動應用
document.addEventListener('DOMContentLoaded', () => app.init());
