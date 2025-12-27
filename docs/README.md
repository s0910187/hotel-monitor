# 前端管理介面使用指南

## 🎉 功能簡介

前端管理介面讓您可以透過瀏覽器輕鬆管理飯店監控系統：
- 📊 視覺化查看房價與空房狀態
- 📈 房價趨勢圖表
- ⚙️ 線上修改監控設定（日期、頻率等）
- ▶️ 手動觸發即時查詢
- 🔄 多裝置自動同步

---

## 📝 啟用 GitHub Pages

### 步驟 1：前往 Repository 設定
1. 開啟瀏覽器，前往 https://github.com/s0910187/hotel-monitor
2. 點擊 **Settings** 標籤
3. 在左側選單找到 **Pages**

### 步驟 2：設定 Pages
1. 在 **Source** 區域，選擇：
   - Branch: `main`
   - Folder: `/docs`
2. 點擊 **Save**
3. 等待約 1 分鐘，頁面會顯示網址：
   - `https://s0910187.github.io/hotel-monitor/`

---

## 🔐 初次設定

### 步驟 1：產生 Personal Access Token

1. 前往 https://github.com/settings/tokens
2. 點擊「**Generate new token (classic)**」
3. 設定：
   - Note: `Hotel Monitor Frontend`
   - Expiration: `90 days` 或自選
   - 勾選權限：
     - ✅ **repo** (完整勾選)
     - ✅ **workflow** (必須勾選，否則無法手動觸發)
   - ⚠️ **注意**：請務必使用 **Tokens (classic)**，不要使用 Fine-grained tokens。
4. 點擊「**Generate token**」
5. 複製產生的 Token（`ghp_xxxxxx...`）
   - ⚠️ **重要**：Token 只會顯示一次，請妥善保存

### 步驟 2：設定前端

1. 開啟前端網頁：https://s0910187.github.io/hotel-monitor/
2. 填寫初次設定表單：
   - **GitHub 使用者名稱**：`s0910187`
   - **Repository 名稱**：`hotel-monitor`
   - **Personal Access Token**：貼上剛才複製的 Token
3. 點擊「**💾 儲存設定**」
4. 驗證成功後，會自動載入儀表板

---

## 📊 使用儀表板

### 查看房價狀態
- 儀表板頂部顯示各日期的房價卡片
- 綠色 ✅ = 有空房
- 紅色 ❌ = 滿房
- 價格以日圓 (¥) 顯示

### 房價趨勢圖
- 圖表呈現各日期的房價走勢
- 方便一眼看出哪天價格較便宜

---

## ⚙️ 修改監控設定

### 修改監控日期
1. 在「監控設定」區域找到「監控日期」輸入框
2. 每行輸入一個日期，格式：`2026/04/17`
3. 新增或刪除日期
4. 點擊「**💾 儲存設定**」
5. 系統會自動推送到 GitHub

### 修改執行頻率
1. 找到「執行頻率 (Cron)」欄位
2. 修改 Cron 表達式：
   - 每小時：`0 * * * *`
   - 每 2 小時：`0 */2 * * *`
   - 每天 6 點和 18 點：`0 6,18 * * *`
3. 點擊「**💾 儲存設定**」

> ⚠️ **注意**：修改 Cron 後需要手動更新 `.github/workflows/hotel-monitor.yml` 中的 schedule

---

## ▶️ 手動執行查詢

1. 點擊右上角「**▶️ 手動執行**」按鈕
2. 系統會觸發 GitHub Actions 執行
3. 約 2-3 分鐘後點擊「**🔄 重新整理**」查看最新結果

---

## 🔄 多裝置同步

### 如何使用
1. 在電腦 A 修改設定並儲存
2. 開啟電腦 B 或手機瀏覽前端
3. 設定會自動同步（因為都存在 GitHub）

### Token 儲存位置
- Token 儲存在瀏覽器的 localStorage
- 每個裝置需要各自輸入一次 Token
- 設定檔本身會自動同步

---

## 📱 手機使用

前端已實作響應式設計，手機瀏覽體驗佳：
1. 開啟手機瀏覽器
2. 前往 https://s0910187.github.io/hotel-monitor/
3. 輸入 Token（僅需一次）
4. 即可查看房價與修改設定

---

## 🛠️ 常見問題

### Q: Token 驗證失敗？
A: 請確認：
- Token 已勾選 `repo` 和 `workflow` 權限
- 使用者名稱與 Repository 名稱正確
- Token 尚未過期

### Q: 儲存設定後沒有反應？
A: 請：
1. 開啟瀏覽器開發者工具 (F12)
2. 查看 Console 是否有錯誤訊息
3. 確認網路連線正常
4. 檢查 GitHub API 速率限制

### Q: 如何更新 Workflow 的執行頻率？
A: 修改前端的 Cron 設定後，還需要：
1. 手動編輯 `.github/workflows/hotel-monitor.yml`
2. 修改 `schedule.cron` 欄位
3. commit 並 push

(未來版本會自動同步此設定)

### Q: Token 安全嗎？
A: Token 儲存在您的瀏覽器 localStorage：
- 只有您能存取
- 不會傳送到其他伺服器
- 建議定期更換 Token
- 不使用時可前往 GitHub 撤銷

---

## 🔒 安全建議

1. **定期更換 Token**：建議每 90 天更換一次
2. **使用最小權限**：只勾選必要的 `repo` 和 `workflow`
3. **撤銷舊 Token**：產生新 Token 後，記得撤銷舊的
4. **私密瀏覽**：在公用電腦使用後，清除瀏覽器資料

---

## 📞 支援

如有任何問題，請：
1. 查看瀏覽器 Console 錯誤訊息
2. 檢查 GitHub Actions 執行日誌
3. 確認 config.json 和 last_state.json 格式正確
