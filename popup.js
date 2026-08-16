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
  const token = fetchToken();
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
      // Если нужен выбор стратегии - коммент убрать:
      // const strategy = await showStrategyPopup(); 
      // await executeFlow(true, null, strategy);
      
      // По умолчанию используем упрощенную стратегию
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
        const displayToken = token.length > 20 ? `${token.substring(0, 15)}…${token.substring(token.length - 5)}` : token;
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

  // --- Предустановки ---
  const presets = {
    view: {
      url: `http://${API_CONFIG.baseUrl}:8080/api/data/flexView/so.SO_H`,
      method: 'POST',
      body: JSON.stringify({
        filterValues: { 'soh.complete': 'false', 'soh.wave.planning': 'true' },
        columns: ['soh.id', 'soh.pickPriority']
      })
    },
    downloadReport: {
	url: `http://${API_CONFIG.baseUrl}:8080/api/report/download`,
      method: 'POST',
      body: JSON.stringify({
        reportDefinitionId: API_CONFIG.idReport,
        format: 'PDF',
        params: {}
      })
    },
    purgeQueue: {
      url:`http://${API_CONFIG.baseUrl}:8080/actuator/hawtio/console/jolokia/?maxDepth=7&maxCollectionSize=50000&ignoreErrors=true&canonicalNaming=false`,
      method: 'POST',
      body: JSON.stringify({
        type: 'exec',
        mbean: 'org.springframework.amqp.rabbit.core:name=getRabbitAdmin,type=RabbitAdmin',
        operation: 'purgeQueue(java.lang.String)',
        arguments: [`${API_CONFIG.rabbitQueuePrefix}-${API_CONFIG.instance}-${API_CONFIG.rabbitQueueSuffix}`]
      })
    },
    planning: {
      url: `http://${API_CONFIG.baseUrl}:8080/api/so/SOService/createTasks`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      defaultParams: {
        pickStrategyPolicyId: API_CONFIG.pickStrategyPolicyId.simplified,
        taskReleasePhases: API_CONFIG.taskReleasePhases,
        actions: API_CONFIG.actions
      }
    }
  };
  
    async function fetchIdsFromDOM() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { ids: [], pairs: {} };
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getIdsFromDOM' });
      return {
        ids: response?.ids || [],
        pairs: response?.pairs || {}
      };
    } catch (error) {
      console.error('Ошибка получения ID из DOM:', error);
      return { ids: [], pairs: {} };
    }
	};
  

  // --- Отдельные функции для немедленного выполнения ---
  async function performPurgeQueue() {
    if (!cachedToken) cachedToken = await fetchToken();
    if (!cachedToken) {
      statusEl.textContent = '❌ Токен не получен';
      statusEl.className = 'status-message error';
      return;
    }
    statusEl.textContent = '⏳ Очистка очереди...';
    statusEl.className = 'status-message info';
    loading.style.display = 'block';
    try {
      const resp = await fetch(presets.purgeQueue.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cachedToken}`,
          'Content-Type': 'application/json'
        },
        body: presets.purgeQueue.body
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      statusEl.textContent = `✅ Очередь очищена: ${JSON.stringify(json)}`;
      statusEl.className = 'status-message success';
    } catch (err) {
      statusEl.textContent = `❌ Ошибка: ${err.message}`;
      statusEl.className = 'status-message error';
    } finally {
      loading.style.display = 'none';
    }
  }

  async function performDownloadReport() {
    if (!cachedToken) cachedToken = await fetchToken();
    if (!cachedToken) {
      statusEl.textContent = '❌ Токен не получен';
      statusEl.className = 'status-message error';
      return;
    }
    statusEl.textContent = '⏳ Скачивание отчёта...';
    statusEl.className = 'status-message info';
    loading.style.display = 'block';
    try {
      const resp = await fetch(presets.downloadReport.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cachedToken}`,
          'Content-Type': 'application/json'
        },
        body: presets.downloadReport.body
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const disposition = resp.headers.get('Content-Disposition');
      let filename = 'report.pdf';
      if (disposition) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) filename = match[1].replace(/['"]/g, '');
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      statusEl.textContent = `✅ Отчёт "${filename}" скачан (${blob.size} байт)`;
      statusEl.className = 'status-message success';
    } catch (err) {
      statusEl.textContent = `❌ Ошибка: ${err.message}`;
      statusEl.className = 'status-message error';
    } finally {
      loading.style.display = 'none';
    }
  }



  async function executeFlow(rebuild) {
  if (!cachedToken) cachedToken = await fetchToken();
  if (!cachedToken) {
    statusEl.textContent = '❌ Токен не получен.';
    statusEl.className = 'status-message error';
    return;
  }
  statusEl.textContent = '';
  statusEl.className = 'status-message info';
  loading.style.display = 'block';

  const authHeaders = {
    'Authorization': `Bearer ${cachedToken}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1) rebuild planning
    statusEl.textContent = '⏳ 1/4 Выполнение flexView...';
    const flexResp = await fetch(presets.view.url, {
      method: 'POST',
      headers: authHeaders,
      body: presets.view.body
    });
    if (!flexResp.ok) throw new Error(`view: HTTP ${flexResp.status}`);
    const flexData = await flexResp.json();
    const data = flexData.data;
    if (!Array.isArray(data)) throw new Error('view: неожиданный формат данных');

    // Формируем массив объектов из flexView
    const flexItems = data.map(item => ({
      id: String(item[0]),          // ID как строка
      priority: String(item[1])     // приоритет как строка
    }));

    statusEl.textContent = `✅ flexView: получено ${flexItems.length} записей`;
    statusEl.className = 'status-message success';
		
		let allItems = flexItems;
		statusEl.textContent += `\n📦 Всего записей для группировки: ${allItems.length}`;
	if(!rebuild)
	{
    // 2) Получение ID и приоритетов из DOM
    const { ids: domIds, pairs } = await fetchIdsFromDOM();
    let domItems = [];
    if (domIds.length > 0) {
      domItems = domIds.map(id => ({
        id: String(id),
        priority: String(pairs[id] || '0')
      }));
      statusEl.textContent += `\n📌 DOM: получено ${domItems.length} записей`;
    } else {
      statusEl.textContent += '\n📌 DOM: записи не найдены';
    }
		allItems = allItems.concat(domItems);
		statusEl.textContent += `\n📦 Всего записей для группировки: ${allItems.length}`;
	}

    // 4) Группировка по приоритету
    const grouped = {};
    for (const { id, priority } of allItems) {
      if (!grouped[priority]) grouped[priority] = [];
      grouped[priority].push(id);
    }

    // Сортируем приоритеты (как числа)
    const sortedPriorities = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    // Вывод статистики
    let report = '\n📊 Группировка по приоритетам:\n';
    for (const p of sortedPriorities) {
      report += `Приоритет ${p}: ${grouped[p].length} ID\n`;
    }
    statusEl.textContent += `\n${report}`;
    statusEl.className = 'status-message success';

    // 5) downloadReport
    statusEl.textContent += '\n⏳ 2/4 Скачивание отчёта...';
    await performDownloadReport();

    // 6) purgeQueue
    statusEl.textContent += '\n⏳ 3/4 Очистка очереди...';
    await performPurgeQueue();

    // 7) planning (отправляем grouped)
    statusEl.textContent += '\n⏳ 4/4 Планирование задач...';
    await sendPlanning(grouped,authHeaders);   // sendPlanning теперь принимает только grouped

    statusEl.textContent += '\n✅ Все задачи запланированы!';
    statusEl.className = 'status-message success';
  } catch (error) {
    statusEl.textContent += `\n❌ Ошибка: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    loading.style.display = 'none';
  }
}

  async function sendPlanning(grouped,authHeaders) {
  const config = presets.planning;
  const BATCH_SIZE = 100;
  const sortedPriorities = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

  for (const priority of sortedPriorities) {
    const ids = grouped[priority];
    statusEl.textContent += `\n📌 Приоритет ${priority}: ${ids.length} ID`;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const requestBody = {
        ids: batch,
        pickStrategyPolicyId: config.defaultParams.pickStrategyPolicyId,
        taskReleasePhases: config.defaultParams.taskReleasePhases,
        actions: config.defaultParams.actions
      };
      try {
        const resp = await fetch(config.url, {
          method: 'POST',
          headers: {...authHeaders},
          body: JSON.stringify(requestBody)
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        await resp.json();
        statusEl.textContent += `\n   ✅ Батч ${batchNum} (${batch.length} ID) отправлен`;
      } catch (err) {
        statusEl.textContent += `\n   ❌ Батч ${batchNum}: ${err.message}`;
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}


  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'tokenUpdated') fetchToken();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchToken();
  });
});