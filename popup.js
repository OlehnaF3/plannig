document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('statusMessage');
  const tokenDisplay = document.getElementById('tokenDisplay');
  const loading = document.getElementById('loading');
  const API_CONFIG = window.APP_CONFIG;
  if (!API_CONFIG) {
    console.warn('Config not loaded');
  }

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-preset]');
    if (!btn) return;

    const presetName = btn.dataset.preset;
    const token = await fetchToken();
    if (!token) {
      alert('❌ Токен не найден');
      return;
    }

    try {
      if (presetName === 'purge') {
        await performDownloadReport(token);
        await performPurgeQueue(token);
        alert('✅ Очистка очереди и скачивание отчёта выполнены');
      }
      else if (presetName === 'rebuildPlanning') {
        await executeFlow(true, null, API_CONFIG.pickStrategyPolicyId.simplified);
        alert('✅ Планирование перестроено');
      }
    } catch (err) {
      alert('❌ Ошибка: ' + err.message);
    }
  });

  // --- Получение токена ---
  async function fetchToken() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        tokenDisplay.textContent = ' Токен: нет активной вкладки';
        tokenDisplay.className = 'token-display error';
        return null;
      }
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getToken' });
      const token = response?.token;
      if (token) {
        const displayToken = Utils.formatTokenDisplay(token);
        tokenDisplay.textContent = ` Токен: ${displayToken} (из куки)`;
        tokenDisplay.className = 'token-display success';
      } else {
        tokenDisplay.textContent = ' Токен: не найден (кука authorization отсутствует)';
        tokenDisplay.className = 'token-display warning';
      }
      return token;
    } catch (error) {
      tokenDisplay.textContent = ` Ошибка: ${error.message}`;
      tokenDisplay.className = 'token-display error';
      return null;
    }
  }

  let cachedToken = await fetchToken();

  // --- Получение tabIndex активной вкладки ---
  async function fetchTabIndex() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return null;
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTabIndex' });
      return response?.tabIndex !== undefined ? response.tabIndex : null;
    } catch (error) {
      console.warn('[Popup] Ошибка получения tabIndex:', error);
      return null;
    }
  }

  // --- Получение ID из DOM через Chrome ---
  async function fetchIdsFromDOM() {
    const tabIndex = await fetchTabIndex();
    if (tabIndex === null) return { ids: [], pairs: {} };
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { ids: [], pairs: {} };
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getLog',
        tabIndex: tabIndex
      });
      const log = response?.log || [];
      return Utils.parseLogToPairs(log);
    } catch (error) {
      console.error('[Popup] Ошибка получения ID из DOM:', error);
      return { ids: [], pairs: {} };
    }
  }

  // --- Отдельные функции для немедленного выполнения ---
  async function performPurgeQueue(token) {
    if (!token) token = cachedToken;
    if (!token) {
      Utils.updateStatus(statusEl, '❌ Токен не получен', 'status-message error');
      return;
    }
    Utils.setLoading(loading, true);
    try {
      Utils.updateStatus(statusEl, '⏳ Очистка очереди...', 'status-message info');
      const json = await Utils.performPurgeQueue(token, API_CONFIG.baseUrl, API_CONFIG);
      Utils.updateStatus(statusEl, `✅ Очередь очищена: ${JSON.stringify(json)}`, 'status-message success');
    } catch (err) {
      Utils.updateStatus(statusEl, `❌ Ошибка: ${err.message}`, 'status-message error');
    } finally {
      Utils.setLoading(loading, false);
    }
  }

  async function performDownloadReport(token) {
    if (!token) token = cachedToken;
    if (!token) {
      Utils.updateStatus(statusEl, '❌ Токен не получен', 'status-message error');
      return;
    }
    Utils.setLoading(loading, true);
    try {
      Utils.updateStatus(statusEl, '⏳ Скачивание отчёта...', 'status-message info');
      const { filename, size } = await Utils.performDownloadReport(token, API_CONFIG.baseUrl, API_CONFIG.idReport);
      Utils.updateStatus(statusEl, `✅ Отчёт "${filename}" скачан (${size} байт)`, 'status-message success');
    } catch (err) {
      Utils.updateStatus(statusEl, `❌ Ошибка: ${err.message}`, 'status-message error');
    } finally {
      Utils.setLoading(loading, false);
    }
  }

  async function executeFlow(rebuild) {
    if (!cachedToken) cachedToken = await fetchToken();
    if (!cachedToken) {
      Utils.updateStatus(statusEl, '❌ Токен не получен.', 'status-message error');
      return;
    }
    Utils.updateStatus(statusEl, '', 'status-message info');
    Utils.setLoading(loading, true);

    const authHeaders = {
      'Authorization': `Bearer ${cachedToken}`,
      'Content-Type': 'application/json'
    };

    try {
      // 1) flexView
      Utils.updateStatus(statusEl, '⏳ 1/4 Выполнение flexView...', 'status-message info');
      const flexData = await Utils.fetchFlexView(cachedToken, API_CONFIG.baseUrl);
      const data = flexData.data;
      if (!Array.isArray(data)) throw new Error('view: неожиданный формат данных');

      const flexItems = data.map(item => ({
        id: String(item[0]),
        priority: String(item[1])
      }));

      let logLines = [`✅ flexView: получено ${flexItems.length} записей`];
      let allItems = flexItems;

      if (!rebuild) {
        // 2) Получение ID и приоритетов из DOM
        const { ids: domIds, pairs } = await fetchIdsFromDOM();
        let domItems = [];
        if (domIds.length > 0) {
          domItems = domIds.map(id => ({
            id: String(id),
            priority: String(pairs[id] || '0')
          }));
          logLines.push(`📌 DOM: получено ${domItems.length} записей`);
        } else {
          logLines.push('📌 DOM: записи не найдены');
        }
        allItems = allItems.concat(domItems);
      }
      logLines.push(`📦 Всего записей для группировки: ${allItems.length}`);

      // 3) Группировка по приоритету
      const grouped = Utils.groupByPriority(allItems);
      const sortedPriorities = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

      let report = '\n📊 Группировка по приоритетам:\n';
      for (const p of sortedPriorities) {
        report += `Приоритет ${p}: ${grouped[p].length} ID\n`;
      }
      Utils.updateStatus(statusEl, logLines.join('\n') + '\n' + report, 'status-message success');

      // 4) downloadReport
      Utils.updateStatus(statusEl, statusEl.textContent + '\n⏳ 2/4 Скачивание отчёта...', 'status-message info');
      await performDownloadReport();

      // 5) purgeQueue
      Utils.updateStatus(statusEl, statusEl.textContent + '\n⏳ 3/4 Очистка очереди...', 'status-message info');
      await performPurgeQueue();

      // 6) planning (батчинг)
      Utils.updateStatus(statusEl, statusEl.textContent + '\n⏳ 4/4 Планирование задач...', 'status-message info');
      await Utils.sendPlanningBatched(authHeaders, API_CONFIG, grouped, statusEl, (msg) => {
        const current = statusEl.textContent;
        Utils.updateStatus(statusEl, current + '\n' + msg, current.includes('❌') ? 'status-message error' : 'status-message success');
      });

      Utils.updateStatus(statusEl, statusEl.textContent + '\n✅ Все задачи запланированы!', 'status-message success');
    } catch (error) {
      Utils.updateStatus(statusEl, statusEl.textContent + `\n❌ Ошибка: ${error.message}`, 'status-message error');
    } finally {
      Utils.setLoading(loading, false);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'tokenUpdated') fetchToken();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchToken();
  });
});
