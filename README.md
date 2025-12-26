# 🏨 盛岡站前大和魯內飯店監控系統

使用 GitHub Actions 自動監控盛岡站前大和魯內飯店房間可用性，當房間狀態改變時自動發送郵件通知。

## ✨ 功能特點

- ✅ 自動監控指定日期的房間可用性
- ✅ 偵測房間狀態變化並即時通知
- ✅ 每小時自動執行（可自訂頻率）
- ✅ 透過 Gmail 發送郵件通知
- ✅ 完全免費，使用 GitHub Actions（每月 2000 分鐘免費額度）
- ✅ 保存歷史狀態，追蹤變化

## 📋 前置需求

1. GitHub 帳號
2. Gmail 帳號（用於發送通知）
3. 啟用 Gmail 兩步驟驗證

## 🚀 快速開始

### 步驟 1：建立 GitHub Repository

1. 登入 [GitHub](https://github.com)
2. 點擊右上角 **+** → **New repository**
3. 命名為 `hotel-monitor`
4. 選擇 **Private**（私人專案）
5. 點擊 **Create repository**

### 步驟 2：設定 Gmail 應用程式密碼

#### 2.1 啟用兩步驟驗證

1. 前往 [Google 帳戶安全性](https://myaccount.google.com/security)
2. 找到「兩步驟驗證」並啟用

#### 2.2 產生應用程式密碼

1. 前往 [應用程式密碼](https://myaccount.google.com/apppasswords)
2. 選擇「其他 (自訂名稱)」
3. 輸入「Hotel Monitor」
4. 點擊「產生」
5. **記下 16 位密碼**（例如：`abcd efgh ijkl mnop`）

### 步驟 3：設定 GitHub Secrets

1. 進入你的 Repository
2. 點擊 **Settings** → **Secrets and variables** → **Actions**
3. 點擊 **New repository secret**

新增以下 3 個 Secrets：

| Name | Value | 說明 |
|------|-------|------|
| `GMAIL_USER` | 你的 Gmail 地址 | 例如：`your-email@gmail.com` |
| `GMAIL_APP_PASSWORD` | 應用程式密碼 | **移除空格**，例如：`abcdefghijklmnop` |
| `MAIL_TO` | 收件人信箱 | 例如：`recipient@gmail.com` |

> ⚠️ **重要**：`GMAIL_APP_PASSWORD` 輸入時要**移除空格**
> - ❌ 錯誤：`abcd efgh ijkl mnop`
> - ✅ 正確：`abcdefghijklmnop`

### 步驟 4：上傳程式碼到 GitHub

#### 方法 A：使用 Git 指令（推薦）

```bash
cd hotel-monitor
git init
git add .
git commit -m "Initial commit: 新增飯店監控系統"
git branch -M main
git remote add origin https://github.com/你的帳號/hotel-monitor.git
git push -u origin main
```

#### 方法 B：使用 GitHub 網頁介面

1. 進入你的 Repository
2. 點擊 **Add file** → **Upload files**
3. 拖曳所有檔案上傳
4. 點擊 **Commit changes**

### 步驟 5：測試執行

1. 進入 Repository
2. 點擊 **Actions** 標籤
3. 點擊左側的「盛岡大和魯內飯店監控」
4. 點擊右側 **Run workflow** → **Run workflow**
5. 等待執行完成（約 2-3 分鐘）
6. 點擊執行結果查看日誌

### 步驟 6：驗證郵件

執行成功後，檢查你的信箱：

- ✅ 應該會收到定時報告或變動通知
- ❌ 如果沒收到，檢查垃圾郵件

## ⚙️ 自訂設定

### 修改監控日期

編輯 [`monitor.js`](monitor.js)，修改 `CHECKIN_DATES` 陣列：

```javascript
const CHECKIN_DATES = [
  '2025-03-15',  // 修改為你要監控的入住日期
  '2025-03-16',
  '2025-03-17',
];
```

### 修改執行頻率

編輯 [`.github/workflows/hotel-monitor.yml`](.github/workflows/hotel-monitor.yml)：

```yaml
# 每小時執行（預設）
- cron: '0 20-23 * * *'
- cron: '0 0-13 * * *'

# 每 2 小時執行（更省額度）
- cron: '0 20-23/2 * * *'
- cron: '0 1-13/2 * * *'

# 每天 2 次（早上 8 點、晚上 8 點）
- cron: '0 0,12 * * *'
```

### 修改飯店網址

如果要監控其他飯店，編輯 [`monitor.js`](monitor.js)：

```javascript
const HOTEL_URL = 'https://www.daiwaroynet.jp/morioka-ekimae/';
```

> ⚠️ **注意**：不同飯店網站結構不同，可能需要調整選取器邏輯

## 📊 執行時間說明

GitHub Actions 會在以下時間自動執行：

- ⏰ **預設設定**：每小時執行一次
  - 台灣時間 04:00-21:00
  - 日本時間 05:00-22:00
  
- 💡 **節省額度**：建議改為每 2 小時執行

也可以隨時**手動觸發**（參考步驟 5）

## 📧 郵件通知說明

### 狀態變更通知

當偵測到房間狀態改變時，會立即發送郵件：

- ✅ 從「已滿房」變為「有空房」
- ❌ 從「有空房」變為「已滿房」

### 每日定時報告

每天台灣時間早上 8 點會發送一次定時報告，顯示所有監控日期的當前狀態。

## 🔍 查看執行記錄

1. 進入 Repository
2. 點擊 **Actions** 標籤
3. 查看所有執行記錄

每次執行會顯示：
- ✅ 執行狀態（成功/失敗）
- ⏱️ 執行時間
- 📝 詳細日誌

## 💰 費用說明

**完全免費！**

- ✅ GitHub Actions 每月提供 **2000 分鐘**免費額度
- ✅ 此監控腳本每次執行約 **2-3 分鐘**
- ✅ 每小時執行一次，一個月約使用 **180 分鐘**
- ✅ **完全在免費額度內**

## ❓ 常見問題

### Q1: 為什麼執行失敗？

檢查以下項目：
1. ✅ GitHub Secrets 是否正確設定（3 個變數都要設定）
2. ✅ Gmail 應用程式密碼是否正確（記得移除空格）
3. ✅ 是否已啟用 Gmail 兩步驟驗證

### Q2: 如何修改監控日期？

編輯 [`monitor.js`](monitor.js)，修改 `CHECKIN_DATES` 陣列。

### Q3: 如何修改執行時間？

編輯 [`.github/workflows/hotel-monitor.yml`](.github/workflows/hotel-monitor.yml)，修改 `cron` 時間。

### Q4: 如何查看歷史記錄？

點擊 **Actions** 標籤，可以看到所有執行記錄。

### Q5: 如何停用監控？

1. 進入 Repository
2. 點擊 **Actions** → 左側選擇 workflow
3. 點擊右上角 **...** → **Disable workflow**

### Q6: 沒有收到郵件怎麼辦？

1. 檢查垃圾郵件資料夾
2. 確認 GitHub Secrets 設定正確
3. 查看 Actions 執行日誌是否有錯誤訊息

### Q7: 可以監控多個飯店嗎？

可以！複製整個專案，修改飯店網址和監控日期即可。

## 📁 專案結構

```
hotel-monitor/
├── .github/
│   └── workflows/
│       └── hotel-monitor.yml    # GitHub Actions 工作流程
├── monitor.js                    # 核心監控腳本
├── package.json                  # Node.js 依賴項目
├── .gitignore                    # Git 忽略檔案
└── README.md                     # 專案說明文件
```

## 🛠️ 技術棧

- **Node.js**: 執行環境
- **Playwright**: 網頁爬取與自動化
- **Nodemailer**: 郵件發送
- **GitHub Actions**: CI/CD 自動化執行

## 📝 授權

MIT License

## 🤝 貢獻

歡迎提交 Issue 或 Pull Request！

## ⚠️ 免責聲明

本專案僅供個人學習和研究使用。使用本程式時請遵守飯店網站的使用條款，避免過度頻繁的請求。

## 📞 支援

如有問題或建議，請開啟 [Issue](../../issues)。

---

**Enjoy your hotel monitoring! 🎉**
