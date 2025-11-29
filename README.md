# 蔬果大學訂單自動列印系統

自動監控並列印訂單的桌面應用程式，支援 Windows、macOS 和 Linux。

## 功能特色

- ✅ **自動監控訂單**：每 30 秒自動檢查新訂單
- ✅ **靜默列印**：無需使用者確認，自動送到印表機
- ✅ **智慧判斷**：記住已列印訂單，避免重複列印
- ✅ **即時通知**：新訂單提示音和桌面通知
- ✅ **列印歷史**：完整的列印記錄查詢
- ✅ **失敗重試**：列印失敗可手動重新列印
- ✅ **彈性設定**：可自訂檢查間隔、通知設定等

## 系統需求

- **作業系統**：Windows 10/11、macOS 10.15+、Linux
- **Node.js**：14.0 或更新版本
- **印表機**：已連接並設定為系統預設印表機

## 安裝步驟

### 1. 安裝 Node.js 依賴

```bash
cd OrderPrintApp
npm install
```

### 2. 設定 API

首次啟動會開啟設定視窗，請填寫：

- **API 網址**：`http://vegetable-university.com/store/api_frontend`
- **管理員 Token**：你的管理員認證 Token

### 3. 啟動應用程式

```bash
# 開發模式
npm run dev

# 正式模式
npm start
```

## 使用說明

### 首次啟動

1. 應用程式啟動後，會自動取得**當天所有pending訂單**
2. 顯示在訂單列表，並標示**列印狀態**（已列印/未列印）
3. 自動列印功能預設為**關閉**
4. 開始定期同步訂單（每 30 秒）

### 自動列印功能

點擊「開啟自動列印」按鈕：
- ✅ **開啟時**：
  - 立即列印所有未列印的訂單
  - 之後有新訂單進來會自動列印
  - 按鈕變成黃色「關閉自動列印」

- ⏸️ **關閉時**：
  - 停止自動列印
  - 訂單同步工作繼續進行
  - 可手動點擊「列印」按鈕列印個別訂單
  - 按鈕變成灰色「開啟自動列印」

### 訂單同步

- 每 30 秒自動同步**最近 2 分鐘**的訂單
- 發現新訂單時：
  - 🔔 播放提示音
  - 📢 顯示桌面通知
  - 📋 顯示在訂單列表
  - 🖨️ 如果自動列印已開啟，自動列印新訂單

### 主要功能

#### 即時訂單監控
- 顯示當天所有 pending 訂單
- 標示列印狀態：已列印（綠色）/ 未列印（橘色）/ 列印中（藍色）/ 失敗（紅色）
- 自動列印關閉時，可手動點擊「列印」按鈕列印個別訂單
- 支援重新列印已列印或失敗的訂單

#### 列印歷史
- 查看所有列印記錄
- 顯示列印時間、客戶資訊
- 支援重新列印

#### 統計資訊
- 今日列印數量
- 列印成功/失敗數量
- 總計列印數量

### 快捷鍵

- `Cmd/Ctrl + R`：手動同步訂單
- `Cmd/Ctrl + P`：切換自動列印
- `Cmd/Ctrl + ,`：開啟設定
- `Cmd/Ctrl + Q`：離開應用程式
- `F12`：開啟開發者工具

## 設定說明

### API 設定
- **API 網址**：後端 API 的完整路徑
- **管理員 Token**：用於認證的 Token

### 監控設定
- **檢查間隔**：每隔多少秒檢查一次（建議 30 秒）
- **檢查範圍**：檢查最近幾分鐘的訂單（建議 2 分鐘）
- **列印間隔**：每筆訂單之間的間隔時間（建議 1000 毫秒）

### 通知設定
- **啟用提示音**：新訂單時播放提示音
- **啟用桌面通知**：新訂單時顯示系統通知
- **開機自動啟動**：系統開機時自動啟動應用程式

## 資料儲存

### 列印記錄資料庫
- 位置：`~/Library/Application Support/vegetable-order-printer/printed_orders.db` (macOS)
- 位置：`%APPDATA%/vegetable-order-printer/printed_orders.db` (Windows)
- 自動清理：保留 30 天記錄

### 設定檔
- 位置：`~/Library/Application Support/vegetable-order-printer/settings.json` (macOS)
- 位置：`%APPDATA%/vegetable-order-printer/settings.json` (Windows)

## 打包發布

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

打包後的檔案會在 `dist/` 目錄中。

## 工作原理

### 首次啟動流程
```
1. 取得當天所有 pending 訂單 (00:00:00 ~ 現在)
2. 查詢本地資料庫，標記每筆訂單的列印狀態
3. 顯示在訂單列表
4. 自動列印預設為「關閉」
5. 開始定期同步訂單
```

### 訂單同步流程（每 30 秒）
```
1. 取得最近 2 分鐘的 pending 訂單
2. 標記列印狀態
3. 找出新訂單（不在當前列表中的）
4. 有新訂單 → 提示音 + 通知 + 加入列表
5. 如果自動列印已開啟 → 自動列印新訂單
6. 記錄到資料庫
```

### 自動列印流程
```
開啟自動列印時：
  ↓
立即列印所有未列印訂單
  ↓
之後有新訂單 → 自動列印
  ↓
關閉自動列印 → 停止自動列印（同步繼續）
```

### 列印流程
```
1. 呼叫 API 取得訂單詳細資料
2. 生成發票 HTML
3. 建立隱藏的 BrowserWindow
4. 載入發票 HTML
5. 使用 silent: true 靜默列印
6. 關閉視窗
```

## 常見問題

### Q: 為什麼訂單沒有自動列印？
A: 請檢查：
1. 印表機是否已連接並設為預設印表機
2. API Token 是否正確
3. 是否有新的 pending 訂單
4. 檢查開發者工具的 Console 是否有錯誤訊息

### Q: 如何避免重複列印？
A: 系統會自動記錄已列印的訂單到本地資料庫，即使重新啟動也不會重複列印。

### Q: 可以同時在多台電腦執行嗎？
A: 可以，但如果要避免重複列印，建議修改後端 API 加入 `is_printed` 欄位。

### Q: 列印失敗怎麼辦？
A:
1. 在「即時訂單」或「列印歷史」中找到失敗的訂單
2. 點擊「重印」按鈕
3. 系統會嘗試重新列印

### Q: 如何更改列印範本？
A: 編輯 `src/OrderPrintManager.js` 中的 `generateInvoiceHTML()` 函數。

## 技術架構

- **框架**：Electron 27.0
- **資料庫**：SQLite3
- **API 請求**：node-fetch
- **列印**：Electron printToPDF with silent mode

## 專案結構

```
OrderPrintApp/
├── main.js                     # Electron 主程序
├── package.json                # 專案設定
├── src/
│   ├── OrderPrintManager.js    # 訂單管理核心邏輯
│   ├── SettingsManager.js      # 設定管理
│   └── views/
│       ├── index.html          # 主視窗
│       ├── settings.html       # 設定視窗
│       ├── styles.css          # 樣式
│       └── renderer.js         # 渲染程序邏輯
└── assets/                     # 圖示等資源
```

## 開發

```bash
# 安裝依賴
npm install

# 開發模式（會開啟 DevTools）
npm run dev

# 正式模式
npm start

# 建立安裝包
npm run build
```

## 授權

MIT License

## 作者

Vegetable University

## 版本歷史

### v1.0.0 (2025-11-29)
- ✅ 首次發布
- ✅ 自動監控並列印訂單
- ✅ 支援靜默列印
- ✅ 列印歷史記錄
- ✅ 可自訂設定
