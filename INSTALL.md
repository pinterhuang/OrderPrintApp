# 安裝指南

## 快速開始

### 1. 環境準備

確保已安裝：
- **Node.js** 14.0 或更新版本
- **npm** (隨 Node.js 自動安裝)
- 印表機（已連接並設為預設）

#### 檢查 Node.js 版本
```bash
node --version
# 應該顯示 v14.0.0 或更高版本
```

### 2. 下載專案

將 `OrderPrintApp` 資料夾複製到你的電腦。

### 3. 安裝依賴套件

開啟終端機（Terminal）或命令提示字元，進入專案目錄：

```bash
cd /path/to/OrderPrintApp
npm install
```

> 首次安裝可能需要幾分鐘，請耐心等待。

### 4. 首次設定

#### 啟動應用程式
```bash
npm start
```

#### 填寫設定
首次啟動會自動開啟設定視窗，請填寫：

1. **API 網址**
   ```
   http://vegetable-university.com/store/api_frontend
   ```

2. **管理員 Token**
   - 請向系統管理員索取
   - 或從後台系統取得你的管理員 Token

3. **監控設定**（使用預設值即可）
   - 檢查間隔：30 秒
   - 檢查範圍：2 分鐘
   - 列印間隔：1000 毫秒

4. **通知設定**（建議全部勾選）
   - ✅ 啟用提示音
   - ✅ 啟用桌面通知
   - ✅ 開機自動啟動

5. 點擊「儲存設定」

### 5. 開始使用

設定完成後：
1. 系統會自動開始監控訂單
2. 首次啟動會列印當天所有未列印訂單
3. 之後每 30 秒自動檢查新訂單

---

## Windows 安裝

### 方式 1：使用 Node.js（開發模式）

1. 安裝 Node.js
   - 前往 https://nodejs.org/
   - 下載並安裝 LTS 版本
   - 安裝時勾選「Add to PATH」

2. 開啟命令提示字元（cmd）
   ```cmd
   cd C:\path\to\OrderPrintApp
   npm install
   npm start
   ```

### 方式 2：使用執行檔（正式版）

> 需要先建立執行檔

1. 建立執行檔
   ```cmd
   npm run build:win
   ```

2. 執行檔位置：
   ```
   OrderPrintApp\dist\訂單列印系統 Setup 1.0.0.exe
   ```

3. 雙擊安裝檔即可安裝

---

## macOS 安裝

### 方式 1：使用 Node.js（開發模式）

1. 安裝 Node.js
   - 前往 https://nodejs.org/
   - 下載並安裝 LTS 版本

2. 開啟終端機（Terminal）
   ```bash
   cd /path/to/OrderPrintApp
   npm install
   npm start
   ```

### 方式 2：使用 .dmg（正式版）

> 需要先建立 dmg

1. 建立 dmg
   ```bash
   npm run build:mac
   ```

2. DMG 位置：
   ```
   OrderPrintApp/dist/訂單列印系統-1.0.0.dmg
   ```

3. 雙擊 .dmg 檔案，拖曳到「應用程式」資料夾

---

## Linux 安裝

### 使用 AppImage

1. 建立 AppImage
   ```bash
   npm run build:linux
   ```

2. 執行權限
   ```bash
   chmod +x dist/訂單列印系統-1.0.0.AppImage
   ```

3. 執行
   ```bash
   ./dist/訂單列印系統-1.0.0.AppImage
   ```

---

## 印表機設定

### Windows

1. 開啟「設定」→「裝置」→「印表機和掃描器」
2. 確認印表機已連接並顯示「就緒」狀態
3. 右鍵點擊印表機 → 設為預設

### macOS

1. 開啟「系統偏好設定」→「印表機與掃描器」
2. 確認印表機已加入
3. 右鍵點擊印表機 → 設為預設印表機

### Linux

```bash
# 查看可用印表機
lpstat -p

# 設定預設印表機
lpoptions -d <printer-name>
```

---

## 測試列印

1. 開啟應用程式
2. 點擊「手動檢查」按鈕
3. 如果有訂單，會自動列印
4. 檢查印表機是否正確輸出

---

## 開機自動啟動

### Windows

應用程式會自動加入到啟動項目（如果在設定中勾選「開機自動啟動」）。

手動設定：
1. `Win + R` 開啟執行視窗
2. 輸入 `shell:startup`
3. 建立應用程式捷徑到此資料夾

### macOS

1. 開啟「系統偏好設定」→「使用者與群組」
2. 點擊「登入項目」
3. 點擊「+」新增應用程式

### Linux

建立 systemd service 或加入到啟動應用程式。

---

## 故障排除

### 無法啟動

```bash
# 清除 node_modules 重新安裝
rm -rf node_modules
npm install

# 清除快取
npm cache clean --force
```

### 列印沒有反應

1. 檢查印表機是否開機
2. 檢查是否設為預設印表機
3. 測試其他程式能否正常列印
4. 查看 Console (F12) 是否有錯誤訊息

### API 連線失敗

1. 檢查網路連線
2. 確認 API 網址正確
3. 確認 Token 有效
4. 使用瀏覽器測試 API：
   ```
   http://vegetable-university.com/store/api_frontend/order_histories?auth_token=YOUR_TOKEN
   ```

### 資料庫錯誤

刪除資料庫檔案重新建立：

**macOS**
```bash
rm ~/Library/Application\ Support/vegetable-order-printer/printed_orders.db
```

**Windows**
```cmd
del %APPDATA%\vegetable-order-printer\printed_orders.db
```

---

## 更新應用程式

1. 備份設定檔（如需要）
2. 下載新版本
3. 執行安裝（會保留設定和資料庫）

---

## 解除安裝

### Windows
1. 控制台 → 程式和功能
2. 找到「訂單列印系統」
3. 點擊「解除安裝」

### macOS
1. 開啟「應用程式」資料夾
2. 將「訂單列印系統」拖到垃圾桶

### 清除所有資料

**macOS**
```bash
rm -rf ~/Library/Application\ Support/vegetable-order-printer
```

**Windows**
```cmd
rmdir /s %APPDATA%\vegetable-order-printer
```

---

## 取得協助

如有問題，請聯絡技術支援或查看：
- [README.md](README.md) - 詳細使用說明
- [ORDER_SYSTEM_ANALYSIS.md](../ORDER_SYSTEM_ANALYSIS.md) - 系統架構分析
