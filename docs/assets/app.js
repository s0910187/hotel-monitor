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
            // 填入既有的設定值
            if (this.api.owner) document.getElementById('ownerInput').value = this.api.owner;
            if (this.api.repo) document.getElementById('repoInput').value = this.api.repo;
            await this.loadData();
        }

        // 綁定事件
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('saveTokenBtn')?.addEventListener('click', () => this.saveToken());
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.loadData());
        document.getElementById('manualRunBtn')?.addEventListener('click', () => this.triggerRun());
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    },

    showSetup() {
        document.getElementById('loadingSpinner').classList.add('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
        document.getElementById('setupSection').classList.remove('hidden');
        document.getElementById('logoutBtn').classList.add('hidden');
    },

    showDashboard() {
        document.getElementById('setupSection').classList.add('hidden');
        document.getElementById('loadingSpinner').classList.add('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        document.getElementById('logoutBtn').classList.remove('hidden');
    },

    logout() {
        if (confirm('確定要登出並清除目前的 Token 嗎？')) {
            localStorage.removeItem('github_config');
            // 強制重新載入頁面，這在 Safari 上最穩定
            window.location.reload();
        }
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
        this.showToast('正在驗證 Token...', 'info');
        const isValid = await this.api.testConnection();
        if (isValid) {
            this.showToast('設定儲存成功！', 'success');
            await this.loadData();
        } else {
            this.showToast('Token 驗證失敗，請檢查權限或 Token 是否正確', 'error');
        }
    },

    async loadData() {
        try {
            document.getElementById('loadingSpinner').classList.remove('hidden');

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

            if (error.message.includes('Bad credentials') || error.message.includes('401')) {
                this.showToast('Token 無效或過期，請重新設定', 'error');
                localStorage.removeItem('github_config');
                setTimeout(() => window.location.reload(), 1500);
                return;
            }

            this.showToast('載入資料失敗: ' + error.message, 'error');
        }
    },

    renderDashboard() {
        // 渲染狀態卡片區域
        const cardsContainer = document.getElementById('statusCards');

        // 移除現有的 grid class，改用自定義容器
        cardsContainer.className = 'bg-white rounded-[2rem] p-8 shadow-sm';

        const dates = Object.keys(this.lastState).sort();

        // 取得更新時間與房型資訊
        // 假設 lastState 中有 metadata，如果沒有就用當前時間
        // 為了符合截圖樣式，我們需要一個標題列
        const adults = this.config?.content?.monitoring?.adults || '?';
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        let html = `
            <div class="flex justify-between items-center mb-8">
                <h2 class="text-2xl font-bold text-gray-800">精確房價監控 (${adults}人房)</h2>
                <div class="text-right">
                    <div class="text-xs text-gray-400 font-bold tracking-widest uppercase mb-1">LAST CHECK</div>
                    <div class="text-xl font-bold text-blue-600 font-mono tracking-wider">${timeString}</div>
                </div>
            </div>
            <div class="flex flex-wrap gap-4 justify-start">
        `;

        if (dates.length === 0) {
            html += '<p class="text-gray-500 w-full text-center py-8">尚無監控資料，請點擊右上角「手動執行」進行第一次查詢。</p>';
        } else {
            dates.forEach(date => {
                const info = this.lastState[date];
                // 格式化日期：2026/04/17 -> 04/17
                const shortDate = date.split('/').slice(1).join('/');

                const isAvailable = info.isAvailable;
                // 滿室樣式
                const statusIcon = isAvailable ? '' : `<svg class="w-8 h-8 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M6 18L18 6M6 6l12 12"></path></svg>`;
                const statusText = isAvailable ?
                    `<span class="text-2xl font-bold text-green-600">有空房</span>` :
                    `<div class="flex items-center justify-center"><span class="text-2xl font-bold text-red-600">❌ 滿室</span></div>`; // 使用 emoji 模擬 X

                const priceClass = isAvailable ? 'text-blue-600' : 'text-gray-300';
                const currency = info.currency === 'JPY' ? '¥' : (info.currency === 'TWD' ? 'NT$' : '');
                const priceDisplay = info.price ? `${currency}${info.price.toLocaleString()}` : '----';

                html += `
                    <div class="border-2 border-slate-100 rounded-[1.5rem] p-6 w-40 flex flex-col items-center justify-center bg-slate-50/50">
                        <div class="text-sm text-slate-500 font-bold mb-4">${shortDate} 入住</div>
                        <div class="mb-4">${statusText}</div>
                        <div class="text-lg font-bold ${priceClass} font-mono tracking-wide">${priceDisplay}</div>
                    </div>
                `;
            });
        }

        html += '</div>'; // 關閉 flex container
        cardsContainer.innerHTML = html;

        // 渲染趨勢圖
        this.renderChart();
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
                    label: '房價趨勢',
                    data: prices,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: 'rgb(59, 130, 246)',
                    pointBorderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#1e293b',
                        bodyColor: '#1e293b',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 12
                            }
                        }
                    },
                    y: {
                        border: {
                            display: false
                        },
                        grid: {
                            color: '#f1f5f9'
                        },
                        beginAtZero: false
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    },

    renderConfigForm() {
        // ... (保持不變)
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
                        <input type="text" id="hotelNameInput" 
                               class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">飯店預訂網址</label>
                        <input type="url" id="hotelUrlInput" 
                               class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                        <p class="text-xs text-gray-500 mt-1">💡 例如：https://reserve.daiwaroynet.jp/zh-tw/booking/result?code=... (系統會自動從網址擷取飯店代碼)</p>
                    </div>
                    <input type="hidden" id="hotelCodeInput">
                </div>
            </div>

            <!-- 監控設定 -->
            <div class="bg-gray-50 p-6 rounded-lg mb-6 border-l-4 border-green-500">
                <h3 class="text-lg font-bold mb-4 text-gray-800">📅 監控設定</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">監控日期（每行一個）</label>
                        <textarea id="datesInput" rows="6" 
                                  class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono text-sm"></textarea>
                        <p class="text-xs text-gray-500 mt-1">💡 每行輸入一個入住日期，格式：2026/04/17</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">房型關鍵字（每行一個）</label>
                        <textarea id="keywordsInput" rows="4" 
                                  class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono text-sm"></textarea>
                        <p class="text-xs text-gray-500 mt-1">💡 系統會尋找包含這些關鍵字的房型（例如：四人房、4人房、クアッド）</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">入住人數</label>
                            <input type="number" id="adultsInput" min="1" max="10"
                                   class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">顯示幣別</label>
                            <select id="currencyInput" class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                                <option value="JPY">日圓 (JPY / ¥)</option>
                                <option value="TWD">台幣 (TWD / NT$)</option>
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
                        <input type="text" id="customCronInput" 
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

        // 重新綁定值
        document.getElementById('hotelNameInput').value = this.config.content.hotel.name;
        document.getElementById('hotelUrlInput').value = this.config.content.hotel.url;
        document.getElementById('hotelCodeInput').value = this.config.content.hotel.code;
        document.getElementById('datesInput').value = this.config.content.monitoring.checkinDates.join('\n');
        document.getElementById('keywordsInput').value = keywords.join('\n');
        document.getElementById('adultsInput').value = this.config.content.monitoring.adults;
        document.getElementById('currencyInput').value = this.config.content.monitoring.currency;
        document.getElementById('customCronInput').value = this.config.content.schedule.cron;

        // Cron select logic
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

        // Event listeners (copied from original)
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

    // ... (saveConfig, triggerRun, showToast 保持不變)
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

            const url = document.getElementById('hotelUrlInput').value.trim();
            // 自動從網址解析 code 參數
            let code = document.getElementById('hotelCodeInput').value.trim();
            try {
                if (url) {
                    const urlObj = new URL(url);
                    if (urlObj.searchParams.has('code')) {
                        code = urlObj.searchParams.get('code');
                    }
                }
            } catch (e) {
                console.warn('無法解析網址:', e);
            }

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
                    url: url,
                    code: code
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
            if (error.message.includes('Bad credentials') || error.message.includes('401')) {
                this.showToast('Token 失效，請重新登入', 'error');
                localStorage.removeItem('github_config');
                setTimeout(() => window.location.reload(), 1500);
                return;
            }
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
            if (error.message.includes('Forbidden') || error.message.includes('403')) {
                this.showToast('❌ 權限不足：請確認 Token 具有 Workflow 權限', 'error');
                return;
            }
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
