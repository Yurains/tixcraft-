(() => {
  'use strict';

  // ========== 自動將 detail 頁面跳轉到 game 頁面 ==========
  if (window.location.href.includes('/activity/detail/')) {
    const newUrl = window.location.href.replace('/activity/detail/', '/activity/game/');
    window.location.replace(newUrl);
    return;
  }

  let running = false;
  let targetDate = '';
  let targetPrice = '';
  let desiredTickets = 4;
  let randomPrice = false;
  let memberCode = '';          // 新增：會員代碼/信用卡
  let refreshSeconds = 3;

  // 階段狀態
  let stageCompleted = { date: false, area: false, ticket: false, memberCode: false };
  let mainIntervalId = null;
  let observer = null;
  let refreshTimer = null;

  const EXCLUDE_KEYWORDS = ['輪椅', '身障', '身心', '障礙', 'Restricted View', '燈柱遮蔽', '視線不完整', '親子'];

  function shouldExclude(text) {
    return EXCLUDE_KEYWORDS.some(kw => text.includes(kw));
  }

  function clickAgree() {
    const cb = document.getElementById('TicketForm_agree');
    if (cb && !cb.checked) cb.click();
  }

  function detectStage() {
    if (document.querySelector('select[id^="TicketForm_ticketPrice"]')) return 'ticket';
    if (document.querySelector('.zone.area-list')) return 'area';
    if (document.querySelector('button.btn-primary.text-bold, a.btn-primary.text-bold')) return 'date';
    return 'unknown';
  }

  // 階段1: 日期選擇
  function handleDateStage() {
    if (stageCompleted.date) return;
    const tds = document.querySelectorAll('td');
    for (const td of tds) {
      if (td.textContent.includes(targetDate.trim())) {
        const btn = td.closest('tr')?.querySelector('.btn-primary.text-bold');
        if (btn) {
          btn.click();
          stageCompleted.date = true;
          return;
        }
      }
    }
  }

  // 階段2: 區域選擇
  function handleAreaStage() {
    if (stageCompleted.area) return;
    const links = Array.from(document.querySelectorAll('.zone.area-list ul li a'));
    if (links.length === 0) { scheduleRefresh(); return; }

    let targetLink = null;
    if (randomPrice) {
      const validLinks = links.filter(a => !shouldExclude(a.textContent.trim()));
      if (validLinks.length > 0) {
        targetLink = validLinks[Math.floor(Math.random() * validLinks.length)];
      }
    } else {
      const priceNum = targetPrice.replace(/\D/g, '');
      targetLink = links.find(a => a.textContent.includes(priceNum) && !shouldExclude(a.textContent));
    }

    if (targetLink) {
      clearRefreshTimer();
      targetLink.click();
      stageCompleted.area = true;
    } else scheduleRefresh();
  }

  // 階段3: 張數選取
  function handleTicketStage() {
    if (stageCompleted.ticket) return;
    
    const selects = document.querySelectorAll('select[id^="TicketForm_ticketPrice"]');
    if (selects.length === 0) {
      scheduleRefresh();
      return;
    }

    let processed = false;
    selects.forEach(select => {
      if (processed) return;
      const options = Array.from(select.options).map(o => parseInt(o.value, 10));
      const validOptions = options.filter(v => v > 0);
      
      if (validOptions.length > 0) {
        const maxAvailable = Math.max(...validOptions);
        const finalCount = Math.min(desiredTickets, maxAvailable);
        
        if (parseInt(select.value, 10) !== finalCount) {
          select.value = String(finalCount);
          ['change', 'input'].forEach(ev => select.dispatchEvent(new Event(ev, { bubbles: true })));
          console.log(`🎟️ 已自動選取張數: ${finalCount}`);
        }
        processed = true;
        stageCompleted.ticket = true;
        clearRefreshTimer();
        // 等待頁面完成張數變更後，再以 1 秒延遲按下確認張數
        setTimeout(() => {
          if (running && stageCompleted.ticket) clickConfirmTickets();
        }, 1000);
      }
    });
    if (!processed) scheduleRefresh();
  }

  function clickConfirmTickets() {
    const buttons = Array.from(document.querySelectorAll('button[type="submit"], button.btn-primary'));
    const button = buttons.find(btn => btn.textContent.trim().includes('確認張數'));
    if (button && !button.disabled) {
      button.click();
      console.log('📤 已按下確認張數');
    }
  }

  function clearRefreshTimer() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  }

  function scheduleRefresh() {
    if (!running || refreshTimer) return;
    const delay = Math.max(1, refreshSeconds) * 1000;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const stage = detectStage();
      if (running && (stage === 'area' || stage === 'ticket') && !stageCompleted.ticket) {
        console.log(`🔄 尚無可購買票券，${refreshSeconds} 秒後刷新`);
        window.location.reload();
      }
    }, delay);
  }

  // ========== 新增：填入會員代碼並送出 ==========
  function handleMemberCodeStage() {
    if (!memberCode || stageCompleted.memberCode) return;

    const input = document.querySelector('input.greyInput[name="checkCode"]');
    if (!input) return;

    // 只填入若尚未填寫或值不同
    if (input.value !== memberCode) {
      input.value = memberCode;
      ['change', 'input'].forEach(ev => input.dispatchEvent(new Event(ev, { bubbles: true })));
      console.log('🔑 已填入會員代碼');
    }

    // 按下送出按鈕
    const submitBtn = document.querySelector('button.btn.btn-primary[type="submit"]');
    if (submitBtn) {
      submitBtn.click();
      console.log('📤 已按下送出');
      // 標記完成，避免重複送出（但頁面跳轉後會重設）
      stageCompleted.memberCode = true;
    }
  }
  // =================================================

  function mainLoop() {
    if (!running) return;
    clickAgree();

    // 先處理原有的日期/區域/張數
    const stage = detectStage();
    if (stage === 'date') handleDateStage();
    else if (stage === 'area') handleAreaStage();
    else if (stage === 'ticket') handleTicketStage();

    // 處理會員代碼（獨立於原有階段，每次都會檢查）
    handleMemberCodeStage();
  }

  function startAutomation() {
    if (mainIntervalId) return;
    mainIntervalId = setInterval(mainLoop, 150);
    observer = new MutationObserver(() => { if (running) mainLoop(); });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('🟢 輔助啟動');
  }

  function stopAutomation() {
    clearRefreshTimer();
    if (mainIntervalId) { clearInterval(mainIntervalId); mainIntervalId = null; }
    if (observer) { observer.disconnect(); observer = null; }
    console.log('🔴 輔助停止');
  }

  // 接收來自 popup 的訊息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start') {
      memberCode = request.memberCode || '';         // 接收會員代碼
      targetDate = request.date;
      targetPrice = request.price || '';
      desiredTickets = parseInt(request.ticketCount, 10) || 4;
      randomPrice = !!request.randomPrice;
      refreshSeconds = Math.max(1, parseInt(request.refreshSeconds, 10) || 3);
      running = true;
      stageCompleted = { date: false, area: false, ticket: false, memberCode: false };
      startAutomation();
      sendResponse({ status: 'started' });
    } else if (request.action === 'pause') {
      running = false;
      stopAutomation();
      sendResponse({ status: 'paused' });
    } else if (request.action === 'getStatus') {
      sendResponse({ running });
    } else if (request.action === 'reset') {
      stageCompleted = { date: false, area: false, ticket: false, memberCode: false };
      sendResponse({ status: 'reset' });
    }
    return true;
  });

  // 跨頁面自動恢復
  (async () => {
    const storage = await chrome.storage.local.get(['tixcraft_running', 'tixcraft_config']);
    if (storage.tixcraft_running && storage.tixcraft_config) {
      const c = storage.tixcraft_config;
      memberCode = c.memberCode || '';
      targetDate = c.date;
      targetPrice = c.price || '';
      desiredTickets = parseInt(c.ticketCount, 10) || 4;
      randomPrice = !!c.randomPrice;
      refreshSeconds = Math.max(1, parseInt(c.refreshSeconds, 10) || 3);
      running = true;
      startAutomation();
    }
  })();
})();
