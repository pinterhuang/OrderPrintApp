const { ipcRenderer } = require('electron');

// DOM 元素
const statusText = document.getElementById('statusText');
const statusIndicator = document.getElementById('statusIndicator');
const todayCount = document.getElementById('todayCount');
const successCount = document.getElementById('successCount');
const failedCount = document.getElementById('failedCount');
const totalCount = document.getElementById('totalCount');
const lastCheckTime = document.getElementById('lastCheckTime');
const realtimeOrders = document.getElementById('realtimeOrders');
const historyOrders = document.getElementById('historyOrders');
const toast = document.getElementById('toast');

// 按鈕
const manualSyncBtn = document.getElementById('manualSyncBtn');
const toggleAutoPrintBtn = document.getElementById('toggleAutoPrintBtn');
const settingsBtn = document.getElementById('settingsBtn');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

// Tab 切換
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// 狀態
let isAutoPrintEnabled = false;
let currentOrdersList = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  setupEventListeners();
  ipcRenderer.send('get-auto-print-status');
});

// 設定事件監聽
function setupEventListeners() {
  // Tab 切換
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });

  // 按鈕事件
  manualSyncBtn.addEventListener('click', () => {
    ipcRenderer.send('manual-check');
    showToast('手動同步訂單中...', 'info');
  });

  toggleAutoPrintBtn.addEventListener('click', () => {
    ipcRenderer.send('toggle-auto-print');
  });

  settingsBtn.addEventListener('click', () => {
    ipcRenderer.send('open-settings');
  });

  refreshHistoryBtn.addEventListener('click', () => {
    loadHistory();
  });

  // 監聽來自主程序的事件
  ipcRenderer.on('status-update', (event, status) => {
    updateStatus(status);
  });

  ipcRenderer.on('pending-orders-loaded', (event, orders) => {
    handlePendingOrdersLoaded(orders);
  });

  ipcRenderer.on('new-orders-found', (event, orders) => {
    handleNewOrdersFound(orders);
  });

  ipcRenderer.on('order-printing', (event, order) => {
    updateOrderStatus(order.order_id, 'printing');
  });

  ipcRenderer.on('order-printed', (event, data) => {
    handleOrderPrinted(data);
    loadStats();
  });

  ipcRenderer.on('auto-print-toggled', (event, enabled) => {
    isAutoPrintEnabled = enabled;
    updateAutoPrintButton();
  });

  ipcRenderer.on('auto-print-status', (event, enabled) => {
    isAutoPrintEnabled = enabled;
    updateAutoPrintButton();
  });

  ipcRenderer.on('stats-data', (event, stats) => {
    updateStats(stats);
  });

  ipcRenderer.on('print-history-data', (event, history) => {
    displayHistory(history);
  });

  ipcRenderer.on('reprint-result', (event, data) => {
    if (data.success) {
      showToast(`訂單 #${data.orderId} 重新列印成功`, 'success');
      updateOrderStatus(data.orderId, 'success');
    } else {
      showToast(`訂單 #${data.orderId} 重新列印失敗`, 'error');
    }
  });
}

// 切換 Tab
function switchTab(tabName) {
  tabBtns.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  tabContents.forEach(content => {
    if (content.id === `${tabName}Tab`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // 切換到歷史時重新載入
  if (tabName === 'history') {
    loadHistory();
  }
}

// 更新狀態
function updateStatus(status) {
  statusText.textContent = status.message;

  statusIndicator.className = 'status-indicator';
  if (status.status === 'running') {
    statusIndicator.classList.add('running');
  } else if (status.status === 'paused') {
    statusIndicator.classList.add('paused');
  } else if (status.status === 'error') {
    statusIndicator.classList.add('error');
  }

  if (status.status === 'checking') {
    lastCheckTime.textContent = new Date().toLocaleTimeString();
  }
}

// 處理未確認訂單載入
function handlePendingOrdersLoaded(orders) {
  console.log('未確認訂單載入:', orders);

  // 清空列表
  realtimeOrders.innerHTML = '';

  if (orders.length === 0) {
    realtimeOrders.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-text">目前沒有未確認訂單</div>
      </div>
    `;
    return;
  }

  currentOrdersList = orders;

  // 顯示所有訂單
  orders.forEach(order => {
    const orderElement = createOrderElement(order);
    realtimeOrders.appendChild(orderElement);
  });

  showToast(`載入 ${orders.length} 筆當天訂單`, 'info');
}

// 處理新訂單發現
function handleNewOrdersFound(orders) {
  console.log('發現新訂單:', orders);

  // 移除空白狀態
  const emptyState = realtimeOrders.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // 加入新訂單到列表前面
  orders.forEach(order => {
    currentOrdersList.unshift(order);

    const orderElement = createOrderElement(order);
    realtimeOrders.insertBefore(orderElement, realtimeOrders.firstChild);
  });

  const unprintedCount = orders.filter(o => !o.isPrinted).length;
  showToast(`發現 ${unprintedCount} 筆新訂單`, 'info');
}

// 處理訂單列印完成
function handleOrderPrinted(data) {
  const { order, success } = data;

  updateOrderStatus(order.order_id, success ? 'success' : 'failed');

  // 更新 currentOrdersList
  const index = currentOrdersList.findIndex(o => o.order_id === order.order_id);
  if (index !== -1) {
    currentOrdersList[index].isPrinted = order.isPrinted;
  }

  const message = success
    ? `訂單 #${order.order_id} 列印成功`
    : `訂單 #${order.order_id} 列印失敗`;

  showToast(message, success ? 'success' : 'error');
}

// 更新訂單狀態
function updateOrderStatus(orderId, status) {
  const orderElement = document.querySelector(`[data-order-id="${orderId}"]`);
  if (!orderElement) return;

  // 移除所有狀態 class
  orderElement.className = 'order-item';

  // 加入新狀態
  if (status === 'printing') {
    orderElement.classList.add('printing');
  } else if (status === 'success') {
    orderElement.classList.add('success');
  } else if (status === 'failed') {
    orderElement.classList.add('failed');
  } else if (status === 'unprinted') {
    orderElement.classList.add('unprinted');
  }

  // 更新狀態標籤
  const statusBadge = orderElement.querySelector('.status-badge');
  const actionBtn = orderElement.querySelector('.action-btn-container');

  if (status === 'printing') {
    statusBadge.className = 'status-badge printing';
    statusBadge.textContent = '⏳ 列印中...';
    if (actionBtn) actionBtn.innerHTML = '';
  } else if (status === 'success') {
    statusBadge.className = 'status-badge success';
    statusBadge.textContent = '✓ 已列印';
    if (actionBtn) actionBtn.innerHTML = `
      <button class="reprint-btn" onclick="reprintOrder(${orderId})">
        🖨️ 重印
      </button>
    `;
  } else if (status === 'failed') {
    statusBadge.className = 'status-badge failed';
    statusBadge.textContent = '✗ 列印失敗';
    if (actionBtn) actionBtn.innerHTML = `
      <button class="reprint-btn" onclick="reprintOrder(${orderId})">
        🖨️ 重印
      </button>
    `;
  } else if (status === 'unprinted') {
    statusBadge.className = 'status-badge unprinted';
    statusBadge.textContent = '⏹ 未列印';
    if (actionBtn && isAutoPrintEnabled) {
      actionBtn.innerHTML = '';
    }
  }
}

// 建立訂單元素
function createOrderElement(order) {
  const div = document.createElement('div');
  div.className = 'order-item';
  div.dataset.orderId = order.order_id;

  // 根據列印狀態設定樣式
  if (order.isPrinted) {
    div.classList.add('success');
  } else {
    div.classList.add('unprinted');
  }

  const customerName = order.customer_name || '未知客戶';
  const phone = order.customer_phone || '';
  const totalPrice = order.total_price || 0;
  const dateAdded = new Date(order.date_added * 1000).toLocaleString();

  let statusBadge = '';
  let actionButton = '';

  if (order.isPrinted) {
    statusBadge = '<span class="status-badge success">✓ 已列印</span>';
    actionButton = `
      <button class="reprint-btn" onclick="reprintOrder(${order.order_id})">
        🖨️ 重印
      </button>
    `;
  } else {
    statusBadge = '<span class="status-badge unprinted">⏹ 未列印</span>';
    if (!isAutoPrintEnabled) {
      actionButton = `
        <button class="print-btn" onclick="printOrder(${order.order_id})">
          🖨️ 列印
        </button>
      `;
    }
  }

  div.innerHTML = `
    <div class="order-info">
      <div class="order-id">#${order.order_id}</div>
      <div class="order-details">
        <span>👤 ${customerName}</span>
        ${phone ? `<span>📞 ${phone}</span>` : ''}
        <span>💰 NT$${totalPrice}</span>
        <span>🕒 ${dateAdded}</span>
      </div>
    </div>
    <div class="order-status">
      ${statusBadge}
      <div class="action-btn-container">
        ${actionButton}
      </div>
    </div>
  `;

  return div;
}

// 列印訂單
function printOrder(orderId) {
  ipcRenderer.send('reprint-order', orderId);
  showToast(`列印訂單 #${orderId}...`, 'info');
  updateOrderStatus(orderId, 'printing');
}

// 重新列印訂單
function reprintOrder(orderId) {
  ipcRenderer.send('reprint-order', orderId);
  showToast(`重新列印訂單 #${orderId}...`, 'info');
  updateOrderStatus(orderId, 'printing');
}

// 更新自動列印按鈕
function updateAutoPrintButton() {
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');

  if (isAutoPrintEnabled) {
    toggleIcon.textContent = '⏸️';
    toggleText.textContent = '關閉自動列印';
    toggleAutoPrintBtn.classList.add('active');
  } else {
    toggleIcon.textContent = '▶️';
    toggleText.textContent = '開啟自動列印';
    toggleAutoPrintBtn.classList.remove('active');
  }

  // 更新訂單列表中的按鈕
  currentOrdersList.forEach(order => {
    if (!order.isPrinted) {
      const orderElement = document.querySelector(`[data-order-id="${order.order_id}"]`);
      if (orderElement) {
        const actionBtn = orderElement.querySelector('.action-btn-container');
        if (actionBtn) {
          if (isAutoPrintEnabled) {
            actionBtn.innerHTML = '';
          } else {
            actionBtn.innerHTML = `
              <button class="print-btn" onclick="printOrder(${order.order_id})">
                🖨️ 列印
              </button>
            `;
          }
        }
      }
    }
  });
}

// 載入統計資料
function loadStats() {
  ipcRenderer.send('get-stats');
}

// 更新統計資料
function updateStats(stats) {
  todayCount.textContent = stats.today || 0;
  successCount.textContent = stats.success || 0;
  failedCount.textContent = stats.failed || 0;
  totalCount.textContent = stats.total || 0;
}

// 載入歷史記錄
function loadHistory() {
  historyOrders.innerHTML = '<div class="loading">載入中...</div>';
  ipcRenderer.send('get-print-history', { limit: 100 });
}

// 顯示歷史記錄
function displayHistory(history) {
  if (history.length === 0) {
    historyOrders.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">尚無列印記錄</div>
      </div>
    `;
    return;
  }

  historyOrders.innerHTML = '';

  history.forEach(record => {
    const order = {
      order_id: record.order_id,
      customer_name: record.customer_name,
      customer_phone: record.customer_phone,
      total_price: record.total_price,
      date_added: record.order_date_added,
      isPrinted: true
    };

    const orderElement = createOrderElement(order);
    historyOrders.appendChild(orderElement);
  });
}

// 顯示提示訊息
function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast ${type}`;

  // 強制重繪
  void toast.offsetWidth;

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// 暴露給 HTML 使用
window.printOrder = printOrder;
window.reprintOrder = reprintOrder;
