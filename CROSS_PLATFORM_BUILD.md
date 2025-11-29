# 跨平台編譯指南

## 在 macOS 上編譯 Windows 版本

---

## 🎯 方案 A: 直接使用 Electron Builder（最簡單）

### 優點
- ✅ 不需要額外安裝
- ✅ 配置簡單
- ✅ 編譯速度快

### 步驟

```bash
# 1. 安裝依賴
npm install

# 2. 直接編譯 Windows 版本
npm run build:win
```

**就這樣！** Electron Builder 會自動處理跨平台編譯。

### 可能遇到的問題

#### 問題 1: 需要簽名相關工具

如果看到類似錯誤：
```
wine is required
```

**解決方法**：
```bash
# 安裝 wine（僅用於簽名，如果不簽名可以忽略）
brew install --cask wine-stable
```

或者在 `package.json` 中停用簽名：

```json
{
  "build": {
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico",
      "sign": null  // 停用簽名
    }
  }
}
```

#### 問題 2: 下載超時

```bash
# 設定鏡像（在中國地區）
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

---

## 🐳 方案 B: 使用 Docker（更穩定）

### 優點
- ✅ 環境一致
- ✅ 不污染本地環境
- ✅ 可重複使用

### 1. 安裝 Docker Desktop

```bash
# 下載 Docker Desktop for Mac
# https://www.docker.com/products/docker-desktop

# 或使用 Homebrew
brew install --cask docker
```

### 2. 建立編譯腳本

建立 `build-windows-docker.sh`：

```bash
#!/bin/bash

echo "🐳 使用 Docker 編譯 Windows 版本..."

# 清理舊的編譯產物
rm -rf dist

# 使用 electron-builder 的 Docker 映像
docker run --rm \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "cd /project && npm install && npm run build:win"

echo "✅ 編譯完成！"
echo "📁 產物位置: dist/"
ls -lh dist/
```

### 3. 執行編譯

```bash
chmod +x build-windows-docker.sh
./build-windows-docker.sh
```

---

## ☁️ 方案 C: 使用 GitHub Actions（雲端編譯）

### 優點
- ✅ 完全不需要本地環境
- ✅ 同時編譯多個平台
- ✅ 自動發布 Release
- ✅ 免費（公開 repo）

### 使用方法

#### 1. 推送到 GitHub

```bash
# 初始化 git（如果還沒有）
git init
git add .
git commit -m "Initial commit"

# 推送到 GitHub
git remote add origin https://github.com/你的帳號/OrderPrintApp.git
git push -u origin main
```

#### 2. 觸發編譯

**方法 1: 建立 Tag**
```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions 會自動：
- 在 macOS 和 Windows 上編譯
- 上傳編譯產物
- 建立 GitHub Release

**方法 2: 手動觸發**
1. 到 GitHub repo
2. 點擊 "Actions" 標籤
3. 選擇 "Build" workflow
4. 點擊 "Run workflow"

#### 3. 下載編譯產物

編譯完成後：
1. 到 "Actions" 標籤
2. 點擊最新的 workflow run
3. 下載 "macos-build" 和 "windows-build"

或者從 "Releases" 頁面下載。

---

## 📊 方案比較

| 方案 | 難度 | 速度 | 環境要求 | 推薦度 |
|------|------|------|----------|--------|
| A: Electron Builder | ⭐ 簡單 | ⚡ 快 | 本地 3GB | ⭐⭐⭐⭐⭐ |
| B: Docker | ⭐⭐ 中等 | ⚡⚡ 中 | Docker | ⭐⭐⭐⭐ |
| C: GitHub Actions | ⭐ 簡單 | ⚡⚡⚡ 慢 | GitHub | ⭐⭐⭐⭐⭐ |

---

## 🔧 詳細配置

### Electron Builder 配置（package.json）

```json
{
  "build": {
    "appId": "com.vegetableuniversity.orderprinter",
    "productName": "訂單列印系統",
    "directories": {
      "output": "dist"
    },
    "files": [
      "**/*",
      "!**/*.md",
      "!dist",
      "!.github"
    ],
    "mac": {
      "target": "dmg",
      "icon": "assets/icon.icns",
      "category": "public.app-category.business"
    },
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico",
      "sign": null,  // 不簽名（避免需要 wine）
      "artifactName": "${productName} Setup ${version}.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "訂單列印系統"
    }
  }
}
```

### 停用 Windows 簽名

如果不需要程式碼簽名（避免需要 wine）：

```json
{
  "build": {
    "win": {
      "sign": null,
      "verifyUpdateCodeSignature": false
    }
  }
}
```

---

## 🎨 準備應用程式圖示

### macOS 圖示 (.icns)

#### 方法 1: 線上轉換
1. 準備 1024x1024 的 PNG 檔案
2. 到 https://cloudconvert.com/png-to-icns
3. 上傳並轉換
4. 下載 `icon.icns` 放到 `assets/`

#### 方法 2: 使用 iconutil（macOS）
```bash
# 1. 建立 iconset 資料夾
mkdir icon.iconset

# 2. 產生不同尺寸
sips -z 16 16     icon_1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon_1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon_1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon_1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon_1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon_1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon_1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon_1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon_1024.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon_1024.png --out icon.iconset/icon_512x512@2x.png

# 3. 轉換為 .icns
iconutil -c icns icon.iconset

# 4. 移動到 assets
mv icon.icns assets/
```

### Windows 圖示 (.ico)

#### 線上轉換
1. 準備 256x256 的 PNG 檔案
2. 到 https://cloudconvert.com/png-to-ico
3. 設定包含多種尺寸：16, 32, 48, 64, 128, 256
4. 下載 `icon.ico` 放到 `assets/`

---

## 📦 編譯檢查清單

### 編譯前

- [ ] 檢查磁碟空間（至少 3GB）
- [ ] 確認 Node.js 版本（14+）
- [ ] 確認 npm 版本（6+）
- [ ] 準備應用程式圖示
- [ ] 更新 package.json 版本號
- [ ] 測試應用程式正常運作（npm start）

### 編譯中

- [ ] 安裝依賴（npm install）
- [ ] 執行編譯命令
- [ ] 等待編譯完成（2-5 分鐘）
- [ ] 檢查 dist/ 目錄

### 編譯後

- [ ] 檢查檔案大小合理（100-200MB）
- [ ] 測試 macOS 版本（開啟 .dmg）
- [ ] 測試 Windows 版本（在 Windows 上）
- [ ] 檢查應用程式圖示
- [ ] 檢查版本號
- [ ] 測試所有核心功能

---

## 🐛 常見問題

### Q1: 需要安裝 wine 嗎？

**A**: 如果不需要簽名 Windows 版本，**不需要** wine。

在 `package.json` 加入：
```json
{
  "build": {
    "win": {
      "sign": null
    }
  }
}
```

### Q2: 編譯 Windows 版本需要 Windows 電腦嗎？

**A**: 不需要！Electron Builder 完全支援在 macOS 上編譯 Windows 版本。

### Q3: 可以同時編譯兩個平台嗎？

**A**: 可以！
```bash
npm run build
```

這會編譯 macOS 和 Windows 版本。

### Q4: 編譯產物可以在舊版 Windows 上執行嗎？

**A**: 可以，支援：
- Windows 7 及以上
- 64位元系統

如果需要支援 32 位元：
```json
{
  "build": {
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64", "ia32"] }
      ]
    }
  }
}
```

### Q5: 為什麼 Windows 版本比 macOS 版本小？

**A**: 正常現象。NSIS 安裝程式壓縮率較高，dmg 包含更多元資料。

### Q6: 如何減小應用程式大小？

**A**:
```json
{
  "build": {
    "asar": true,
    "compression": "maximum",
    "files": [
      "!**/*.map",
      "!**/node_modules/@types/**"
    ]
  }
}
```

### Q7: GitHub Actions 免費嗎？

**A**:
- 公開 repo：完全免費，無限制
- 私有 repo：每月 2000 分鐘免費

---

## 💡 最佳實踐

### 1. 使用 GitHub Actions 自動化

- 推送 tag 自動編譯
- 自動建立 Release
- 同時編譯多個平台
- 不佔用本地資源

### 2. 本地快速測試

```bash
# 只編譯當前平台（最快）
npm run build:mac

# 不打包，直接執行
npm start
```

### 3. 版本管理

```bash
# 自動更新版本號
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.1 -> 1.1.0
npm version major  # 1.1.0 -> 2.0.0

# 建立 tag
git push origin main --tags

# GitHub Actions 會自動編譯
```

---

## 🚀 推薦工作流程

### 開發階段
```bash
npm start  # 直接執行，不編譯
```

### 測試階段
```bash
npm run build:mac  # 只編譯 macOS 測試
```

### 發布階段
```bash
# 推送到 GitHub，讓 Actions 編譯
git tag v1.0.0
git push origin main --tags

# 或本地編譯
npm run build  # 編譯所有平台
```

---

## 📚 參考資源

- [Electron Builder 文件](https://www.electron.build/)
- [Multi Platform Build](https://www.electron.build/multi-platform-build)
- [GitHub Actions for Electron](https://www.electron.build/configuration/publish#github-repository)
- [Code Signing](https://www.electron.build/code-signing)
