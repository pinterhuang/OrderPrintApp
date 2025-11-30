const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { BrowserWindow, Notification } = require('electron');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class OrderPrintManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      apiUrl: config.apiUrl || 'http://vegetable-university.com/store/api_frontend',
      authToken: config.authToken || '',
      checkInterval: config.checkInterval || 30000,  // 30 秒
      recentMinutes: config.recentMinutes || 2,      // 檢查最近 2 分鐘
      enableSound: config.enableSound !== false,      // 預設開啟提示音
      enableNotification: config.enableNotification !== false,
      printDelay: config.printDelay || 1000,         // 每筆訂單間隔 1 秒
      ...config
    };

    // 初始化資料庫
    const dbPath = path.join(require('electron').app.getPath('userData'), 'printed_orders.db');
    this.db = new sqlite3.Database(dbPath);

    this.dbReady = this.initDB();  // 等待資料庫初始化
    this.isFirstRun = true;
    this.isSyncing = false;
    this.syncInterval = null;
    this.isAutoPrintEnabled = false;  // 自動列印開關
    this.currentOrders = [];  // 當前訂單列表
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS printed_orders (
            order_id INTEGER PRIMARY KEY,
            printed_at INTEGER NOT NULL,
            order_date_added INTEGER NOT NULL,
            ship_date INTEGER,
            customer_name TEXT,
            customer_phone TEXT,
            total_price REAL,
            print_status TEXT DEFAULT 'success'
          )
        `, (err) => {
          if (err) {
            console.error('建立資料表失敗:', err);
            reject(err);
          }
        });

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_printed_at
          ON printed_orders(printed_at)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_order_date
          ON printed_orders(order_date_added)
        `, (err) => {
          if (err) {
            console.error('建立索引失敗:', err);
            reject(err);
          } else {
            console.log('✅ 資料庫初始化完成');
            resolve();
          }
        });
      });
    });
  }

  // 啟動監控
  async start() {
    // 等待資料庫初始化完成
    await this.dbReady;

    console.log('=== 訂單列印系統啟動 ===');
    console.log('API URL:', this.config.apiUrl);
    console.log('檢查間隔:', this.config.checkInterval / 1000, '秒');
    console.log('檢查範圍:', this.config.recentMinutes, '分鐘');

    this.emit('statusUpdate', {
      status: 'starting',
      message: '系統啟動中...'
    });

    // 首次啟動：取得所有未確認訂單（只顯示，不列印）
    await this.loadPendingOrders();

    // 開始定期同步訂單
    this.startSyncOrders();

    this.emit('statusUpdate', {
      status: 'running',
      message: '訂單同步中（自動列印：關閉）'
    });
  }

  // 停止系統
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isSyncing = false;
    this.isAutoPrintEnabled = false;

    this.emit('statusUpdate', {
      status: 'stopped',
      message: '系統已停止'
    });
  }

  // 切換自動列印
  toggleAutoPrint() {
    this.isAutoPrintEnabled = !this.isAutoPrintEnabled;

    if (this.isAutoPrintEnabled) {
      console.log('✅ 自動列印：已開啟');

      // 開啟時，立即列印所有未列印的訂單
      this.printUnprintedOrders();

      this.emit('statusUpdate', {
        status: 'running',
        message: '訂單同步中（自動列印：開啟）'
      });
    } else {
      console.log('⏸️ 自動列印：已關閉');

      this.emit('statusUpdate', {
        status: 'running',
        message: '訂單同步中（自動列印：關閉）'
      });
    }

    this.emit('autoPrintToggled', this.isAutoPrintEnabled);
    return this.isAutoPrintEnabled;
  }

  // 開始同步訂單
  startSyncOrders() {
    if (this.isSyncing) return;

    this.isSyncing = true;

    // 定期同步（每 30 秒）
    this.syncInterval = setInterval(async () => {
      await this.syncRecentOrders();
    }, this.config.checkInterval);

    console.log('🔄 訂單同步已啟動');
  }

  // 載入所有未確認訂單（首次啟動）- 參照後台 get_last_orders
  async loadPendingOrders() {
    console.log('\n[首次啟動] 載入所有未確認訂單（pending）...');

    try {
      // 取得所有 pending 狀態的訂單，date_from = 0 表示不限時間
      // 這會載入所有尚未處理的訂單，和後台 get_last_orders(0) 一樣
      const orders = await this.fetchOrders({
        status: 'pending',
        date_from: 0
      });

      console.log(`找到 ${orders.length} 筆未確認訂單`);

      // 標記列印狀態
      const ordersWithStatus = await this.markOrdersPrintStatus(orders);
      this.currentOrders = ordersWithStatus;

      // 發送到前端顯示
      this.emit('pendingOrdersLoaded', ordersWithStatus);

      const unprintedCount = ordersWithStatus.filter(o => !o.isPrinted).length;
      console.log(`其中 ${unprintedCount} 筆未列印`);

      this.isFirstRun = false;

    } catch (error) {
      console.error('載入未確認訂單失敗:', error);
      this.emit('statusUpdate', {
        status: 'error',
        message: '載入訂單失敗: ' + error.message
      });
    }
  }

  // 同步最近 2 分鐘的訂單
  async syncRecentOrders() {
    const now = Math.floor(Date.now() / 1000);
    const recentTime = now - (this.config.recentMinutes * 60);

    console.log(`\n[${new Date().toLocaleTimeString()}] 同步最近 ${this.config.recentMinutes} 分鐘的訂單...`);

    try {
      const orders = await this.fetchOrders({
        status: 'pending',
        date_from: recentTime,
        date_to: now
      });

      if (orders.length === 0) {
        console.log('沒有新訂單');
        return;
      }

      console.log(`找到 ${orders.length} 筆最近訂單`);

      // 標記列印狀態
      const ordersWithStatus = await this.markOrdersPrintStatus(orders);

      // 找出新訂單（不在 currentOrders 中）
      const newOrders = ordersWithStatus.filter(order =>
        !this.currentOrders.find(o => o.order_id === order.order_id)
      );

      if (newOrders.length > 0) {
        console.log(`🆕 發現 ${newOrders.length} 筆新訂單`);

        // 加入到當前訂單列表
        this.currentOrders = [...newOrders, ...this.currentOrders];

        // 發送到前端
        this.emit('newOrdersFound', newOrders);

        // 提示音和通知
        this.playNotificationSound();
        const unprintedCount = newOrders.filter(o => !o.isPrinted).length;
        if (unprintedCount > 0) {
          this.showNotification(`發現 ${unprintedCount} 筆新訂單`);
        }

        // 如果自動列印已開啟，列印新訂單
        if (this.isAutoPrintEnabled) {
          const unprintedOrders = newOrders.filter(o => !o.isPrinted);
          if (unprintedOrders.length > 0) {
            await this.printOrders(unprintedOrders);
          }
        }
      }

    } catch (error) {
      console.error('同步訂單失敗:', error);
      this.emit('statusUpdate', {
        status: 'error',
        message: '同步訂單失敗: ' + error.message
      });
    }
  }

  // 列印所有未列印的訂單
  async printUnprintedOrders() {
    const unprintedOrders = this.currentOrders.filter(o => !o.isPrinted);

    if (unprintedOrders.length === 0) {
      console.log('沒有未列印的訂單');
      this.showNotification('目前沒有需要列印的訂單');
      return;
    }

    console.log(`開始列印 ${unprintedOrders.length} 筆未列印訂單`);
    this.showNotification(`開始列印 ${unprintedOrders.length} 筆訂單`);

    await this.printOrders(unprintedOrders);
  }

  // 標記訂單的列印狀態
  async markOrdersPrintStatus(orders) {
    if (orders.length === 0) return [];

    const orderIds = orders.map(o => o.order_id);
    const printedIds = await this.getPrintedOrderIds(orderIds);

    return orders.map(order => ({
      ...order,
      isPrinted: printedIds.includes(order.order_id)
    }));
  }

  // 取得已列印的訂單 ID
  async getPrintedOrderIds(orderIds) {
    return new Promise((resolve, reject) => {
      const placeholders = orderIds.map(() => '?').join(',');
      this.db.all(
        `SELECT order_id FROM printed_orders
         WHERE order_id IN (${placeholders})`,
        orderIds,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.order_id));
        }
      );
    });
  }

  // 呼叫 API 取得訂單
  async fetchOrders({ status, date_from, date_to }) {
    const url = `${this.config.apiUrl}/admin_order_histories`;
    const params = new URLSearchParams({
      status: status,
      date_from: date_from,
      date_to: date_to,
      auth_token: this.config.authToken
    });

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      throw new Error(`API 錯誤: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 200) {
      throw new Error(data.message || 'API 錯誤');
    }

    let orders = data.orders || [];

    // 格式化訂單資料
    orders = orders.map(order => ({
      ...order,
      customer_name: order.customer_name || '未知客戶',
      customer_phone: order.customer_phone || '',
      total_price: parseFloat(order.order_total || order.total_price || 0),
      date_added: parseInt(order.order_placed_timestamp || order.date_added || 0)
    }));

    return orders;
  }

  // 過濾出未列印的訂單
  async filterUnprintedOrders(orders) {
    if (orders.length === 0) return [];

    const orderIds = orders.map(o => o.order_id);

    const printedIds = await new Promise((resolve, reject) => {
      const placeholders = orderIds.map(() => '?').join(',');
      this.db.all(
        `SELECT order_id FROM printed_orders
         WHERE order_id IN (${placeholders})`,
        orderIds,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.order_id));
        }
      );
    });

    return orders.filter(order => !printedIds.includes(order.order_id));
  }

  // 列印訂單
  async printOrders(orders) {
    for (const order of orders) {
      await this.printSingleOrder(order);
      await this.sleep(this.config.printDelay);
    }
  }

  // 列印單一訂單
  async printSingleOrder(order) {
    console.log(`\n📄 列印訂單 #${order.order_id}`);
    console.log(`   客戶: ${order.customer_name}`);
    console.log(`   金額: NT$${order.total_price}`);
    console.log(`   下單時間: ${new Date(order.date_added * 1000).toLocaleString()}`);

    // 標記為列印中
    this.emit('orderPrinting', order);

    try {
      // 取得訂單詳細資料
      const orderDetails = await this.fetchOrderDetails(order.order_id);

      // 執行列印
      const success = await this.autoPrint(orderDetails);

      if (success) {
        await this.markAsPrinted(order, 'success');
        console.log(`   ✅ 列印成功`);

        // 更新 currentOrders 中的狀態
        this.updateOrderStatus(order.order_id, true);

        this.showNotification(`訂單 #${order.order_id} 列印成功`);
        this.emit('orderPrinted', { ...order, isPrinted: true }, true);
      } else {
        await this.markAsPrinted(order, 'failed');
        console.log(`   ❌ 列印失敗`);

        this.showNotification(`訂單 #${order.order_id} 列印失敗`, true);
        this.emit('orderPrinted', order, false);
      }

    } catch (error) {
      console.error(`   ❌ 列印錯誤:`, error.message);
      await this.markAsPrinted(order, 'failed');
      this.emit('orderPrinted', order, false);
    }
  }

  // 更新訂單狀態
  updateOrderStatus(orderId, isPrinted) {
    const index = this.currentOrders.findIndex(o => o.order_id === orderId);
    if (index !== -1) {
      this.currentOrders[index].isPrinted = isPrinted;
    }
  }

  // 取得訂單詳細資料
  async fetchOrderDetails(orderId) {
    const url = `${this.config.apiUrl}/admin_order_details`;
    const params = new URLSearchParams({
      order_id: orderId,
      auth_token: this.config.authToken
    });

    const response = await fetch(`${url}?${params}`);
    const data = await response.json();

    if (data.status !== 200) {
      throw new Error(data.message || 'API 錯誤');
    }

    return data.order || data.order_details || data;
  }

  // 自動列印（靜默列印）
  async autoPrint(orderDetails) {
    return new Promise((resolve) => {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });

      const invoiceHTML = this.generateInvoiceHTML(orderDetails);

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(invoiceHTML)}`);

      printWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          printWindow.webContents.print(
            {
              silent: true,
              printBackground: true,
              margins: {
                marginType: 'printableArea'
              }
            },
            (success, errorType) => {
              if (!success) {
                console.error('列印失敗:', errorType);
              }
              printWindow.close();
              resolve(success);
            }
          );
        }, 500);
      });

      // 超時處理
      setTimeout(() => {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.close();
          resolve(false);
        }
      }, 30000);
    });
  }

  // 生成發票 HTML - 參照後台 last_orders.php
  generateInvoiceHTML(orderDetails) {
    const customer = orderDetails.customer || {};
    const products = orderDetails.products || [];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif;
            padding: 20px;
            font-size: 14px;
            line-height: 1.6;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #333;
          }
          .header h1 {
            font-size: 24px;
            margin-bottom: 10px;
          }
          .ship-date {
            font-size: 16px;
            color: #666;
            margin-top: 10px;
          }
          .info-section {
            margin-bottom: 20px;
          }
          .info-row {
            margin-bottom: 5px;
          }
          .info-label {
            font-weight: bold;
            display: inline-block;
            width: 100px;
          }
          .order-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .order-table th,
          .order-table td {
            border: 1px solid #333;
            padding: 8px;
            text-align: left;
          }
          .order-table th {
            background-color: #6c757d;
            color: white;
            font-weight: bold;
          }
          .order-table td.right {
            text-align: right;
          }
          .total-row {
            background-color: #f8f9fa;
          }
          .grand-total-row {
            font-weight: bold;
            border-top: 2px solid #333;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>蔬果大學</h1>
          <h2>訂單摘要</h2>
          <div class="ship-date">出貨日期：${this.formatDate(orderDetails.ship_date)}</div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">訂單編號：</span>
            <span>#${orderDetails.order_id}</span>
          </div>
          <div class="info-row">
            <span class="info-label">客戶姓名：</span>
            <span>${customer.name || '未知'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">聯絡電話：</span>
            <span>${customer.phone || ''}</span>
          </div>
          <div class="info-row">
            <span class="info-label">送貨地址：</span>
            <span>${customer.address || ''}</span>
          </div>
        </div>

        <table class="order-table">
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>品名</th>
              <th style="width: 80px;">數量</th>
              <th style="width: 100px;">單位</th>
              <th style="width: 100px;">總單位</th>
              <th style="width: 100px;">單價</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((product, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${product.name || ''}</td>
                <td>${product.quantity || 0}</td>
                <td>${product.unit_number || ''} ${product.unit || ''}</td>
                <td>${product.total_unit || ''}</td>
                <td class="right">${product.total_price || 0}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td>小計</td>
              <td class="right">${orderDetails.sub_total || 0}</td>
            </tr>
            <tr class="total-row">
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td>運費</td>
              <td class="right">${orderDetails.delivery_charge > 0 ? orderDetails.delivery_charge : '免費'}</td>
            </tr>
            <tr class="grand-total-row">
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td>總計</td>
              <td class="right">${orderDetails.grand_total || 0}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;
  }

  // 標記為已列印
  markAsPrinted(order, status = 'success') {
    return new Promise((resolve, reject) => {
      const now = Math.floor(Date.now() / 1000);

      this.db.run(
        `INSERT OR REPLACE INTO printed_orders
         (order_id, printed_at, order_date_added, ship_date, customer_name, customer_phone, total_price, print_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.order_id,
          now,
          order.date_added,
          order.ship_date,
          order.customer_name || '',
          order.customer_phone || '',
          order.total_price || 0,
          status
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // 重新列印訂單
  async reprintOrder(orderId) {
    try {
      const orderDetails = await this.fetchOrderDetails(orderId);
      const success = await this.autoPrint(orderDetails);

      if (success) {
        this.showNotification(`訂單 #${orderId} 重新列印成功`);
      }

      return success;
    } catch (error) {
      console.error('重新列印失敗:', error);
      return false;
    }
  }

  // 取得統計資料
  async getStats() {
    return new Promise((resolve, reject) => {
      const today = this.getStartOfDay();

      this.db.get(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN print_status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN print_status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN printed_at >= ? THEN 1 ELSE 0 END) as today
         FROM printed_orders`,
        [today],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // 取得列印歷史
  async getPrintHistory(options = {}) {
    return new Promise((resolve, reject) => {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      this.db.all(
        `SELECT * FROM printed_orders
         ORDER BY printed_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // 工具函數
  getStartOfDay(daysOffset = 0) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + daysOffset);
    return Math.floor(date.getTime() / 1000);
  }

  formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  playNotificationSound() {
    if (!this.config.enableSound) return;

    // 使用系統提示音
    const { shell } = require('electron');
    console.log('🔔 播放提示音');

    // 可以使用自訂音效檔案
    // const audio = new Audio('path/to/notification.mp3');
    // audio.play();
  }

  showNotification(message, isError = false) {
    if (!this.config.enableNotification) return;

    new Notification({
      title: isError ? '列印失敗' : '訂單列印系統',
      body: message,
      icon: path.join(__dirname, '../assets/icon.png')
    }).show();
  }
}

module.exports = OrderPrintManager;
