const { app, BrowserWindow, ipcMain, Notification, Menu } = require('electron');
const path = require('path');
const OrderPrintManager = require('./src/OrderPrintManager');
const SettingsManager = require('./src/SettingsManager');

let mainWindow;
let settingsWindow;
let manager;
let settings;

// 建立主視窗
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('src/views/index.html');

  // 開發模式開啟 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 建立選單
  createMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 建立設定視窗
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: false,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile('src/views/settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// 建立選單
function createMenu() {
  const template = [
    {
      label: '檔案',
      submenu: [
        {
          label: '設定',
          accelerator: 'CmdOrCtrl+,',
          click: () => createSettingsWindow()
        },
        { type: 'separator' },
        {
          label: '離開',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '操作',
      submenu: [
        {
          label: '手動同步訂單',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (manager) {
              manager.syncRecentOrders();
            }
          }
        },
        {
          label: '重新載入今日訂單',
          click: () => {
            if (manager) {
              manager.loadTodayOrders();
            }
          }
        },
        { type: 'separator' },
        {
          label: '切換自動列印',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (manager) {
              manager.toggleAutoPrint();
            }
          }
        }
      ]
    },
    {
      label: '檢視',
      submenu: [
        {
          label: '重新載入',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow.reload()
        },
        {
          label: '開發者工具',
          accelerator: 'F12',
          click: () => mainWindow.webContents.toggleDevTools()
        },
        { type: 'separator' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '縮小' },
        { role: 'resetZoom', label: '重設縮放' }
      ]
    },
    {
      label: '說明',
      submenu: [
        {
          label: '關於',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '關於',
              message: '蔬果大學訂單列印系統',
              detail: 'Version 1.0.0\n\n自動監控並列印訂單\n\n© 2025 Vegetable University'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App 啟動
app.whenReady().then(() => {
  // 載入設定
  settings = new SettingsManager();
  const config = settings.getSettings();

  // 檢查是否已設定
  if (!config.apiUrl || !config.authToken) {
    // 首次使用，開啟設定視窗
    createSettingsWindow();
  } else {
    // 啟動主視窗
    createMainWindow();

    // 初始化訂單管理器
    manager = new OrderPrintManager(config);

    // 延遲 2 秒後啟動監控（讓 UI 先載入）
    setTimeout(() => {
      manager.start();

      // 監聽事件
      manager.on('pendingOrdersLoaded', (orders) => {
        if (mainWindow) {
          mainWindow.webContents.send('pending-orders-loaded', orders);
        }
      });

      manager.on('newOrdersFound', (orders) => {
        if (mainWindow) {
          mainWindow.webContents.send('new-orders-found', orders);
        }
      });

      manager.on('orderPrinting', (order) => {
        if (mainWindow) {
          mainWindow.webContents.send('order-printing', order);
        }
      });

      manager.on('orderPrinted', (order, success) => {
        if (mainWindow) {
          mainWindow.webContents.send('order-printed', { order, success });
        }
      });

      manager.on('statusUpdate', (status) => {
        if (mainWindow) {
          mainWindow.webContents.send('status-update', status);
        }
      });

      manager.on('autoPrintToggled', (enabled) => {
        if (mainWindow) {
          mainWindow.webContents.send('auto-print-toggled', enabled);
        }
      });
    }, 2000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 事件處理
ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

ipcMain.on('save-settings', (event, newSettings) => {
  settings.saveSettings(newSettings);

  // 重新啟動 manager
  if (manager) {
    manager.stop();
  }

  manager = new OrderPrintManager(newSettings);
  manager.start();

  event.reply('settings-saved', { success: true });
});

ipcMain.on('get-settings', (event) => {
  event.reply('settings-data', settings.getSettings());
});

ipcMain.on('get-stats', (event) => {
  if (manager) {
    manager.getStats().then(stats => {
      event.reply('stats-data', stats);
    });
  }
});

ipcMain.on('get-print-history', (event, options) => {
  if (manager) {
    manager.getPrintHistory(options).then(history => {
      event.reply('print-history-data', history);
    });
  }
});

ipcMain.on('manual-check', async () => {
  if (manager) {
    try {
      await manager.syncRecentOrders();
      console.log('✅ 手動同步完成');
    } catch (error) {
      console.error('❌ 手動同步失敗:', error);
    }
  }
});

ipcMain.on('toggle-auto-print', () => {
  if (manager) {
    const enabled = manager.toggleAutoPrint();
    if (mainWindow) {
      mainWindow.webContents.send('auto-print-toggled', enabled);
    }
  }
});

ipcMain.on('get-auto-print-status', (event) => {
  if (manager) {
    event.reply('auto-print-status', manager.isAutoPrintEnabled);
  }
});

ipcMain.on('reprint-order', async (event, orderId) => {
  if (manager) {
    const success = await manager.reprintOrder(orderId);
    event.reply('reprint-result', { orderId, success });
  }
});

ipcMain.on('preview-order', async (event, orderId) => {
  if (manager) {
    try {
      await manager.previewOrder(orderId);
    } catch (error) {
      console.error('預覽訂單失敗:', error);
      const { dialog } = require('electron');
      dialog.showErrorBox('預覽失敗', `無法預覽訂單 #${orderId}: ${error.message}`);
    }
  }
});

ipcMain.on('get-printers', async (event) => {
  // settingsWindow 或 mainWindow 都可以用來取得印表機列表
  const window = settingsWindow || mainWindow;
  if (window && window.webContents) {
    try {
      const printers = await window.webContents.getPrintersAsync();
      event.reply('printers-list', printers);
    } catch (error) {
      console.error('取得印表機清單失敗:', error);
      event.reply('printers-list', []);
    }
  } else {
    event.reply('printers-list', []);
  }
});

ipcMain.on('test-print', async (event, printerName) => {
  try {
    const testWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const testHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif;
            padding: 20px;
          }
          h1 { font-size: 24px; margin-bottom: 10px; }
          p { font-size: 14px; margin: 5px 0; }
        </style>
      </head>
      <body>
        <h1>測試列印</h1>
        <p>印表機：${printerName}</p>
        <p>時間：${new Date().toLocaleString()}</p>
        <p>狀態：✓ 列印測試成功</p>
      </body>
      </html>
    `;

    await testWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(testHTML));

    testWindow.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: printerName
    }, (success, errorType) => {
      testWindow.close();
      if (success) {
        event.reply('test-print-result', { success: true });
      } else {
        event.reply('test-print-result', { success: false, error: errorType });
      }
    });
  } catch (error) {
    event.reply('test-print-result', { success: false, error: error.message });
  }
});

// 處理未捕獲的錯誤
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);

  const { dialog } = require('electron');
  dialog.showErrorBox('發生錯誤', error.message);
});

module.exports = { mainWindow };
