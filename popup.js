let logBox = document.getElementById('logBox');
const startBtn = document.getElementById('startBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const stepText = document.getElementById('stepText');
const randomCheck = document.getElementById('randomCheck');
const priceInput = document.getElementById('priceInput');
const memberCodeInput = document.getElementById('memberCode'); // 新增

randomCheck.addEventListener('change', () => {
  priceInput.disabled = randomCheck.checked;
  priceInput.placeholder = randomCheck.checked ? '隨機模式，免填' : '例如 4270';
});

function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-${type}">${msg}</span>`;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

function updateUIState(state) {
  if (state === 'running') {
    startBtn.textContent = '暫停';
    startBtn.className = '';
    statusDot.className = 'status-indicator running';
    statusText.textContent = '運行中';
    stepText.textContent = '自動掃描中';
  } else {
    startBtn.textContent = '啟動';
    startBtn.className = 'stopped';
    statusDot.className = 'status-indicator stopped';
    statusText.textContent = '已停止';
    stepText.textContent = '暫停';
  }
}

async function sendCommand(action, params = {}) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return null;
    return await chrome.tabs.sendMessage(tab.id, { action, ...params });
  } catch (err) {
    return null;
  }
}

function getConfig() {
  return {
    memberCode: memberCodeInput.value.trim(),            // 新增
    date: document.getElementById('dateInput').value.trim(),
    price: randomCheck.checked ? '' : document.getElementById('priceInput').value.trim(),
    ticketCount: parseInt(document.getElementById('ticketCount').value, 10),
    randomPrice: randomCheck.checked,
    refreshSeconds: Math.max(1, parseInt(document.getElementById('refreshSeconds').value, 10) || 3)
  };
}

async function saveConfigToStorage(config, running = false) {
  await chrome.storage.local.set({
    tixcraft_config: config,
    tixcraft_running: running
  });
}

// 啟動 / 暫停
startBtn.addEventListener('click', async () => {
  const config = getConfig();
  if (!config.date || (!config.randomPrice && !config.price)) {
    log('請輸入日期與價格', 'error');
    return;
  }
  const res = await sendCommand('getStatus');
  if (res && res.running) {
    const pauseRes = await sendCommand('pause');
    if (pauseRes) {
      await chrome.storage.local.set({ tixcraft_running: false });
      log('已暫停自動化', 'info');
      updateUIState('stopped');
    }
  } else {
    const startRes = await sendCommand('start', config);
    if (startRes) {
      await saveConfigToStorage(config, true);
      log('已啟動自動化', 'success');
      updateUIState('running');
    } else {
      log('啟動失敗，請確認在搶票頁面', 'error');
    }
  }
});

// 儲存設定（若運行中則暫停）
document.getElementById('saveBtn').addEventListener('click', async () => {
  const config = getConfig();
  if (!config.date) { log('請輸入日期', 'error'); return; }

  const res = await sendCommand('getStatus');
  if (res && res.running) {
    await sendCommand('pause');
    updateUIState('stopped');
    log('偵測到運行中，已自動暫停並儲存設定', 'info');
  } else {
    log('設定已儲存', 'success');
  }

  await saveConfigToStorage(config, false);
});

document.getElementById('resetBtn').addEventListener('click', async () => {
  await sendCommand('reset');
  log('已重置步驟狀態', 'info');
});

document.getElementById('forceRestoreBtn').addEventListener('click', async () => {
  const storage = await chrome.storage.local.get(['tixcraft_config']);
  if (storage.tixcraft_config) {
    const startRes = await sendCommand('start', storage.tixcraft_config);
    if (startRes) {
      await chrome.storage.local.set({ tixcraft_running: true });
      updateUIState('running');
      log('已強制恢復', 'success');
    }
  }
});

window.addEventListener('load', async () => {
  const storage = await chrome.storage.local.get(['tixcraft_running', 'tixcraft_config']);
  if (storage.tixcraft_config) {
    const c = storage.tixcraft_config;
    // 還原會員代碼
    if (c.memberCode) memberCodeInput.value = c.memberCode;
    document.getElementById('dateInput').value = c.date || '';
    document.getElementById('ticketCount').value = c.ticketCount || 4;
    document.getElementById('refreshSeconds').value = c.refreshSeconds || 3;
    if (c.randomPrice) {
      randomCheck.checked = true;
      priceInput.disabled = true;
    } else {
      document.getElementById('priceInput').value = c.price || '';
    }
  }
  const scriptRes = await sendCommand('getStatus');
  updateUIState((scriptRes && scriptRes.running) ? 'running' : 'stopped');
});
