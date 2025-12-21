const Database = require('better-sqlite3');
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

    // 初始化資料庫 (better-sqlite3 是同步的)
    const dbPath = path.join(require('electron').app.getPath('userData'), 'printed_orders.db');
    this.db = new Database(dbPath);

    this.initDB();  // 同步初始化資料庫
    this.isFirstRun = true;
    this.isSyncing = false;
    this.syncInterval = null;
    this.isAutoPrintEnabled = false;  // 自動列印開關
    this.currentOrders = [];  // 當前訂單列表
  }

  initDB() {
    // better-sqlite3 使用同步 API
    this.db.exec(`
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
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_printed_at
      ON printed_orders(printed_at)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_order_date
      ON printed_orders(order_date_added)
    `);

    console.log('✅ 資料庫初始化完成');
  }

  // 啟動監控
  async start() {
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

      // 開啟時，設定 flag 並建立列印迴圈
      const unprintedOrders = this.currentOrders
        .filter(o => !o.isPrinted)
        .sort((a, b) => a.date_added - b.date_added); // 從最舊到最新

      if (unprintedOrders.length > 0) {
        console.log(`開始列印 ${unprintedOrders.length} 筆未列印訂單（從舊到新）`);
        this.startPrintLoop(unprintedOrders);
      }

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

  // 載入當天和隔天未確認訂單（首次啟動）
  async loadPendingOrders() {
    console.log('\n[首次啟動] 載入當天和隔天未確認訂單（pending）...');

    try {
      // 取得當天開始的時間戳（00:00:00）
      const todayStart = this.getStartOfDay();
      // 取得後天開始的時間戳（隔天 23:59:59 之後）
      const tomorrowEnd = this.getStartOfDay(2);

      // 取得當天和隔天的 pending 訂單
      const orders = await this.fetchOrders({
        status: 'pending',
        date_from: todayStart
      });

      console.log(`找到 ${orders.length} 筆未確認訂單`);

      // 過濾：只保留當天和隔天的訂單（從今天 00:00 到後天 00:00）
      const relevantOrders = orders.filter(order => {
        const orderDate = order.date_added || 0;
        return orderDate >= todayStart && orderDate < tomorrowEnd;
      });

      console.log(`當天和隔天訂單數量: ${relevantOrders.length}`);

      // 標記列印狀態
      const ordersWithStatus = await this.markOrdersPrintStatus(relevantOrders);
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

  // 重新載入今日和明日訂單
  async loadTodayOrders() {
    console.log('\n[手動] 重新載入今日和明日訂單...');
    await this.loadPendingOrders();
  }

  // 同步最近 2 分鐘的訂單（當天和隔天）
  async syncRecentOrders() {
    const now = Math.floor(Date.now() / 1000);
    const recentTime = now - (this.config.recentMinutes * 60);
    const todayStart = this.getStartOfDay();
    const tomorrowEnd = this.getStartOfDay(2);

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

      // 只保留當天和隔天的訂單
      const relevantOrders = orders.filter(order => {
        const orderDate = order.date_added || 0;
        return orderDate >= todayStart && orderDate < tomorrowEnd;
      });

      if (relevantOrders.length === 0) {
        console.log('沒有當天和隔天的新訂單');
        return;
      }

      console.log(`當天和隔天訂單: ${relevantOrders.length} 筆`);

      // 標記列印狀態
      const ordersWithStatus = await this.markOrdersPrintStatus(relevantOrders);

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

        // 如果自動列印已開啟，建立列印迴圈
        if (this.isAutoPrintEnabled) {
          const unprintedOrders = newOrders
            .filter(o => !o.isPrinted)
            .sort((a, b) => a.date_added - b.date_added); // 從最舊到最新

          if (unprintedOrders.length > 0) {
            console.log(`新訂單列印：${unprintedOrders.length} 筆（從舊到新）`);
            this.startPrintLoop(unprintedOrders);
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

  // 開始列印迴圈（會檢查自動列印 flag）
  async startPrintLoop(orders) {
    for (const order of orders) {
      // 檢查自動列印 flag，若關閉則跳出迴圈
      if (!this.isAutoPrintEnabled) {
        console.log('自動列印已關閉，停止列印迴圈');
        break;
      }

      await this.printSingleOrder(order);
      await this.sleep(this.config.printDelay);
    }
  }

  // 列印所有未列印的訂單（手動觸發）
  async printUnprintedOrders() {
    const unprintedOrders = this.currentOrders
      .filter(o => !o.isPrinted)
      .sort((a, b) => a.date_added - b.date_added); // 從最舊到最新

    if (unprintedOrders.length === 0) {
      console.log('沒有未列印的訂單');
      this.showNotification('目前沒有需要列印的訂單');
      return;
    }

    console.log(`手動列印 ${unprintedOrders.length} 筆訂單（從舊到新）`);
    this.showNotification(`開始列印 ${unprintedOrders.length} 筆訂單`);

    // 手動列印不受自動列印 flag 影響
    for (const order of unprintedOrders) {
      await this.printSingleOrder(order);
      await this.sleep(this.config.printDelay);
    }
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
    // better-sqlite3 使用同步 API
    const placeholders = orderIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `SELECT order_id FROM printed_orders
       WHERE order_id IN (${placeholders})`
    );
    const rows = stmt.all(...orderIds);
    return rows.map(r => r.order_id);
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

    // 格式化訂單資料（API 已包含客戶資訊）
    orders = orders.map(order => {
      return {
        ...order,
        customer_name: order.customer_name || '未知客戶',
        customer_phone: order.customer_phone || '',
        customer_email: order.customer_email || '',
        customer_address: order.customer_address || '',
        total_price: parseFloat(order.order_total || order.total_price || 0),
        date_added: parseInt(order.order_placed_timestamp || order.date_added || 0)
      };
    });

    return orders;
  }

  // 過濾出未列印的訂單
  async filterUnprintedOrders(orders) {
    if (orders.length === 0) return [];

    const orderIds = orders.map(o => o.order_id);
    const placeholders = orderIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `SELECT order_id FROM printed_orders
       WHERE order_id IN (${placeholders})`
    );
    const rows = stmt.all(...orderIds);
    const printedIds = rows.map(r => r.order_id);

    return orders.filter(order => !printedIds.includes(order.order_id));
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

      // 從詳細資料中提取客戶資訊
      const customerName = orderDetails.customer?.name || orderDetails.customer_name || order.customer_name || '未知客戶';
      const customerPhone = orderDetails.customer?.phone || orderDetails.customer_phone || order.customer_phone || '';

      // 更新訂單物件的客戶資訊
      const updatedOrder = {
        ...order,
        customer_name: customerName,
        customer_phone: customerPhone
      };

      // 執行列印
      const success = await this.autoPrint(orderDetails);

      if (success) {
        await this.markAsPrinted(updatedOrder, 'success');
        console.log(`   ✅ 列印成功`);

        // 更新 currentOrders 中的狀態
        this.updateOrderStatus(order.order_id, true);

        this.showNotification(`訂單 #${order.order_id} 列印成功`);
        this.emit('orderPrinted', { ...updatedOrder, isPrinted: true }, true);
      } else {
        await this.markAsPrinted(updatedOrder, 'failed');
        console.log(`   ❌ 列印失敗`);

        this.showNotification(`訂單 #${order.order_id} 列印失敗`, true);
        this.emit('orderPrinted', updatedOrder, false);
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
          const printOptions = {
            silent: true,
            printBackground: true,
            color: false,  // 黑白列印
            margins: {
              marginType: 'none'
            },
            scaleFactor: 100,
            landscape: false,
            pageSize: {
              width: 80000,  // 80mm in microns
              height: 297000  // auto height for thermal printer
            }
          };

          // 如果有設定印表機名稱，使用指定印表機
          if (this.config.printerName) {
            printOptions.deviceName = this.config.printerName;
          }

          printWindow.webContents.print(
            printOptions,
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

  // 生成發票 HTML - 完全參照後台 last_orders.php 格式
  generateInvoiceHTML(orderDetails) {
    // 解析資料結構
    const customer = orderDetails.customer || {
      name: orderDetails.user_name || orderDetails.customer_name || '未知',
      phone: orderDetails.phone || orderDetails.customer_phone || '',
      email: orderDetails.email || orderDetails.customer_email || '',
      address: orderDetails.address || orderDetails.customer_address || ''
    };

    const products = orderDetails.products || [];
    const payment = orderDetails.payment || {};

    // 計算總計和品項數
    let grand_total = 0;
    const itemCount = products.length;
    const productsHTML = products.map((product) => {
      const quantity = parseInt(product.item_quantity || product.quantity || 0);
      const unit_price = parseFloat(product.discount_price || product.price || 0);
      const product_total = parseFloat(product.total_price || (unit_price * quantity));
      grand_total += product_total;

      return `
        <tr>
          <td>${product.name || ''}</td>
          <td>${quantity} ${product.unit || ''}</td>
          <td>${Math.round(unit_price)}</td>
          <td>${Math.round(product_total)}</td>
        </tr>
      `;
    }).join('');

    // 加上運費（如果有）
    const delivery_charge = orderDetails.delivery_charge || 0;
    grand_total += delivery_charge;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif;
            width: 80mm;
            padding: 4mm;
            font-size: 11px;
            line-height: 1.4;
            color: #000;
          }
          .customer-section {
            margin-bottom: 3mm;
            padding-bottom: 2mm;
            border-bottom: 1px dashed #333;
          }
          .customer-section p {
            margin: 1mm 0;
            font-size: 11px;
            line-height: 1.3;
          }
          .customer-section p b {
            font-size: 12px;
            font-weight: bold;
          }
          h6 {
            font-size: 12px;
            margin: 3mm 0 2mm 0;
            font-weight: bold;
            color: #000;
            border-bottom: 1px solid #333;
            padding-bottom: 1mm;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 2mm 0;
            font-size: 10px;
          }
          table.order-table thead th {
            background-color: #333;
            color: white;
            padding: 1.5mm 1mm;
            text-align: left;
            border: 1px solid #000;
            font-size: 10px;
            font-weight: bold;
          }
          table.order-table thead th:nth-child(1) {
            width: 40%;
          }
          table.order-table thead th:nth-child(2) {
            width: 20%;
          }
          table.order-table thead th:nth-child(3) {
            width: 20%;
          }
          table.order-table thead th:nth-child(4) {
            width: 20%;
          }
          table.order-table tbody td {
            padding: 1.5mm 1mm;
            border: 1px solid #999;
            background-color: #fff;
            font-size: 10px;
          }
          table.order-table tbody tr.border-top td {
            border-top: 2px solid #000;
            font-weight: bold;
            background-color: #f0f0f0;
            font-size: 11px;
          }
          .note-section {
            margin-top: 3mm;
            padding: 2mm;
            background-color: #f5f5f5;
            border: 1px dashed #333;
          }
          .note-section h6 {
            margin: 0 0 1mm 0;
            font-size: 11px;
            border-bottom: none;
            padding-bottom: 0;
          }
          .note-section p {
            margin: 0;
            font-size: 10px;
            line-height: 1.4;
            word-wrap: break-word;
          }
          @media print {
            body {
              padding: 4mm;
            }
          }
        </style>
      </head>
      <body>
        <div class="customer-section">
          <p><b>客戶</b></p>
          <p>姓名 : ${customer.name || '未知'}</p>
          <p>電話 : ${customer.phone || ''}</p>
          <p>地址 : ${customer.address || ''}</p>
        </div>

        <h6>訂單摘要 :</h6>
        <table class="order-table">
          <thead>
            <tr>
              <th>品名</th>
              <th>總單位</th>
              <th>單價</th>
              <th>總價</th>
            </tr>
          </thead>
          <tbody>
            ${productsHTML}
            <tr class="border-top">
              <td colspan="2">總計 (共${itemCount}項)</td>
              <td></td>
              <td>NT$${Math.round(grand_total)}</td>
            </tr>
          </tbody>
        </table>

        ${orderDetails.note ? `
        <div class="note-section">
          <h6>備註 :</h6>
          <p>${orderDetails.note}</p>
        </div>
        ` : ''}
      </body>
      </html>
    `;
  }

  // 標記為已列印
  markAsPrinted(order, status = 'success') {
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO printed_orders
       (order_id, printed_at, order_date_added, ship_date, customer_name, customer_phone, total_price, print_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      order.order_id,
      now,
      order.date_added,
      order.ship_date,
      order.customer_name || '',
      order.customer_phone || '',
      order.total_price || 0,
      status
    );
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

  // 預覽列印訂單
  async previewOrder(orderId) {
    try {
      const orderDetails = await this.fetchOrderDetails(orderId);
      return await this.showPrintPreview(orderDetails);
    } catch (error) {
      console.error('預覽失敗:', error);
      return false;
    }
  }

  // 顯示列印預覽
  async showPrintPreview(orderDetails) {
    return new Promise((resolve) => {
      const previewWindow = new BrowserWindow({
        width: 400,
        height: 800,
        title: `訂單預覽 #${orderDetails.order_id || ''}`,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });

      const invoiceHTML = this.generateInvoiceHTML(orderDetails);

      previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(invoiceHTML)}`);

      previewWindow.on('closed', () => {
        resolve(true);
      });

      // 加入列印按鈕
      previewWindow.webContents.on('did-finish-load', () => {
        previewWindow.webContents.executeJavaScript(`
          const printButton = document.createElement('button');
          printButton.textContent = '列印';
          printButton.style.cssText = \`
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          \`;
          printButton.onclick = () => {
            window.print();
          };
          document.body.appendChild(printButton);

          // 隱藏列印按鈕在實際列印時
          window.matchMedia('print').addListener((mql) => {
            if (mql.matches) {
              printButton.style.display = 'none';
            } else {
              printButton.style.display = 'block';
            }
          });
        `);
      });
    });
  }

  // 取得統計資料
  async getStats() {
    const today = this.getStartOfDay();

    const stmt = this.db.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN print_status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN print_status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN printed_at >= ? THEN 1 ELSE 0 END) as today
       FROM printed_orders`
    );

    return stmt.get(today);
  }

  // 取得列印歷史
  async getPrintHistory(options = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const stmt = this.db.prepare(
      `SELECT * FROM printed_orders
       ORDER BY printed_at DESC
       LIMIT ? OFFSET ?`
    );

    return stmt.all(limit, offset);
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
