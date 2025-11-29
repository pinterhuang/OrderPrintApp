# 編譯指南

## 前置需求

### 1. 磁碟空間
- 至少需要 **3GB 可用空間**
- Electron 和相關依賴約 1.5GB
- 編譯產物約 500MB - 1GB

### 2. 軟體需求
- Node.js 14.0+ (建議使用 LTS 版本)
- npm 6.0+

---

## 編譯步驟

### 步驟 1: 清理空間（如果需要）

```bash
# 清理 npm 快取
npm cache clean --force

# 清理其他專案的 node_modules (可選)
# 例如：
# rm -rf ~/Documents/Project/Full_Project/BCStore/node_modules
```

### 步驟 2: 安裝依賴

```bash
cd /Users/pinter/Documents/Project/Full_Project/OrderPrintApp
npm install
```

**預期時間**: 3-5 分鐘
**下載大小**: 約 1.5GB

如果出現錯誤，請檢查：
- 磁碟空間是否充足
- 網路連線是否正常
- Node.js 版本是否符合需求

### 步驟 3: 測試運行（建議）

編譯前先測試程式是否正常運作：

```bash
npm start
```

檢查項目：
- [ ] 應用程式是否能正常啟動
- [ ] 設定視窗是否能開啟
- [ ] API 連線是否正常（需填入 Token）

### 步驟 4: 編譯

#### 編譯 macOS 版本

```bash
npm run build:mac
```

**產物位置**: `dist/訂單列印系統-1.0.0.dmg`
**檔案大小**: 約 150-200MB
**編譯時間**: 2-5 分鐘

#### 編譯 Windows 版本（在 macOS 上）

```bash
npm run build:win
```

**產物位置**: `dist/訂單列印系統 Setup 1.0.0.exe`
**檔案大小**: 約 80-120MB
**編譯時間**: 2-5 分鐘

**注意**: 在 macOS 上編譯 Windows 版本需要額外工具，可能會提示安裝 wine 或 mono。

#### 編譯兩個平台

```bash
npm run build
```

這會同時編譯 macOS 和 Windows 版本。

---

## 編譯產物

編譯完成後，`dist/` 目錄會包含：

### macOS
- `訂單列印系統-1.0.0.dmg` - 安裝檔
- `訂單列印系統-1.0.0-mac.zip` - 壓縮檔（可選）

### Windows
- `訂單列印系統 Setup 1.0.0.exe` - 安裝程式
- `訂單列印系統-1.0.0-win.zip` - 免安裝版（可選）

---

## 故障排除

### 問題 1: 磁碟空間不足

```
Error: ENOSPC: no space left on device
```

**解決方法**:
```bash
# 1. 檢查可用空間
df -h

# 2. 清理不需要的檔案
# 例如：清理下載資料夾、清空垃圾桶等

# 3. 清理 npm 快取
npm cache clean --force

# 4. 清理其他專案的 node_modules
find ~/Documents -name "node_modules" -type d
# 手動刪除不需要的
```

### 問題 2: Electron 下載失敗

```
Error: connect ETIMEDOUT
```

**解決方法**:
```bash
# 使用中國鏡像（如果在中國）
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# 或使用淘寶鏡像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/

# 重新安裝
npm install
```

### 問題 3: Windows 編譯失敗（在 macOS 上）

```
Error: wine not found
```

**解決方法**:

不建議在 macOS 上編譯 Windows 版本。建議：

1. **使用 Windows 電腦編譯**
   ```bash
   # 在 Windows 上
   npm install
   npm run build:win
   ```

2. **或使用 GitHub Actions 自動編譯**（進階）

3. **或接受只編譯 macOS 版本**

### 問題 4: sqlite3 編譯錯誤

```
Error: node-gyp rebuild
```

**解決方法**:
```bash
# 安裝 Xcode Command Line Tools
xcode-select --install

# 重新安裝
rm -rf node_modules
npm install
```

---

## 簡化版編譯腳本

如果想要一鍵編譯，可以建立腳本：

### build.sh (macOS/Linux)

```bash
#!/bin/bash

echo "🚀 開始編譯訂單列印系統..."

# 檢查磁碟空間
AVAILABLE=$(df -h . | tail -1 | awk '{print $4}')
echo "可用空間: $AVAILABLE"

# 清理舊的 dist
echo "📦 清理舊的編譯產物..."
rm -rf dist

# 安裝依賴
echo "📥 安裝依賴..."
npm install

# 編譯
echo "🔨 開始編譯..."
npm run build:mac

echo "✅ 編譯完成！"
echo "📁 產物位置: dist/"
ls -lh dist/
```

使用方式:
```bash
chmod +x build.sh
./build.sh
```

---

## 測試編譯產物

### macOS

1. 開啟 `dist/訂單列印系統-1.0.0.dmg`
2. 拖曳到「應用程式」資料夾
3. 開啟應用程式
4. 測試所有功能

### Windows

1. 在 Windows 電腦上執行 `訂單列印系統 Setup 1.0.0.exe`
2. 按照安裝精靈完成安裝
3. 開啟應用程式
4. 測試所有功能

---

## 發布檢查清單

編譯完成後，發布前檢查：

- [ ] 應用程式圖示正確顯示
- [ ] 版本號正確（1.0.0）
- [ ] 設定功能正常
- [ ] API 連線正常
- [ ] 訂單同步功能正常
- [ ] 自動列印 Toggle 功能正常
- [ ] 列印功能正常（需連接印表機測試）
- [ ] 資料庫儲存正常
- [ ] 統計資料正確
- [ ] 列印歷史正常

---

## 進階設定

### 修改應用程式圖示

1. 準備圖示檔案：
   - macOS: 1024x1024 PNG → 轉換為 .icns
   - Windows: 256x256 PNG → 轉換為 .ico

2. 放置到 `assets/` 目錄：
   ```
   assets/
   ├── icon.png
   ├── icon.icns (macOS)
   └── icon.ico (Windows)
   ```

3. 重新編譯

### 修改應用程式名稱

編輯 `package.json`:
```json
{
  "name": "vegetable-order-printer",
  "productName": "蔬果大學訂單列印系統",  // 修改這裡
  "version": "1.0.0"
}
```

### 程式碼簽名（macOS）

需要 Apple Developer Account：

```bash
# 設定環境變數
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=certificate-password

# 編譯
npm run build:mac
```

---

## 常見問題

### Q: 編譯需要多久？
A: 首次編譯約 5-10 分鐘（包含下載 Electron）。之後約 2-3 分鐘。

### Q: 可以在 macOS 上編譯 Windows 版本嗎？
A: 可以，但可能遇到問題。建議在對應平台編譯。

### Q: 編譯產物可以在其他電腦執行嗎？
A: 可以，這是完整的獨立應用程式。

### Q: 如何更新版本號？
A: 修改 `package.json` 中的 `version` 欄位，然後重新編譯。

### Q: 編譯產物太大怎麼辦？
A: Electron 應用程式通常比較大（100-200MB）。可以：
  - 使用壓縮工具減小體積
  - 考慮使用 electron-builder 的 ASAR 打包
  - 移除不需要的依賴

---

## 參考資源

- [Electron Builder 文件](https://www.electron.build/)
- [Electron 官方文件](https://www.electronjs.org/)
- [Node.js 官網](https://nodejs.org/)

---

## 需要協助？

如果編譯遇到問題，請提供：
1. 錯誤訊息完整內容
2. Node.js 版本 (`node --version`)
3. npm 版本 (`npm --version`)
4. 作業系統版本
5. 可用磁碟空間
