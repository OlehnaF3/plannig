// ======================== ОБЩИЕ УТИЛИТЫ ========================
// Этот файл подключается в manifest.json как web_accessible_resource

// Получение токена из различных источников
export function getToken() {
  const match = document.cookie.match(/(?:^|; )token=([^;]+)/);
  if (match) return match[1];
  if (window._csrf) return window._csrf;
  const meta = document.querySelector('meta[name="_csrf"]');
  if (meta) return meta.getAttribute('content');
  try {
    const stored = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (stored) return stored;
  } catch (e) {}
  return null;
}

// Синхронное получение ID из DOM
export function getIdsFromDOM() {
  const containers = document.querySelectorAll('app-screen-engine.active.ng-star-inserted');
  const ids = [];
  const pairs = {};
  containers.forEach(container => {
    const rows = container.querySelectorAll('tr.ng-star-inserted.active');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 12) {
        const idDiv = cells[2].querySelector('div[style*="text-align: right;"]');
        if (idDiv) {
          const id = idDiv.innerText.trim();
          if (id) {
            const priority = cells[10].innerText.trim();
            pairs[id] = priority || '0';
            ids.push(id);
          }
        }
      }
    });
  });
  return { ids, pairs };
}

// Получение ID из DOM через сообщение Chrome
export async function fetchIdsFromDOM(chrome) {
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
}

// ======================== API ФУНКЦИИ ========================

// Получение данных из FlexView
export async function fetchFlexView(token, baseUrl) {
  const url = `http://${baseUrl}:8080/api/data/flexView/so.SO_H`;
  const body = JSON.stringify({
    filterValues: {
      'soh.complete': 'false',
      'soh.wave.planning': 'true'
    },
    columns: ['soh.id', 'soh.wave.pickPriority']
  });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });
  if (!resp.ok) throw new Error(`FlexView HTTP ${resp.status}`);
  const json = await resp.json();
  return json.data;
}

// Скачивание отчёта
export async function performDownloadReport(token, baseUrl, idReport) {
  const url = `http://${baseUrl}:8080/api/report/download`;
  const body = JSON.stringify({
    reportDefinitionId: idReport,
    format: 'PDF',
    params: {}
  });
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body
  });
  if (!resp.ok) throw new Error(`Download report HTTP ${resp.status}`);
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
  return { filename, size: blob.size };
}

// Очистка очереди RabbitMQ
export async function performPurgeQueue(token, baseUrl, config) {
  const url = `http://${baseUrl}:8080/actuator/hawtio/console/jolokia/?maxDepth=7&maxCollectionSize=50000&ignoreErrors=true&canonicalNaming=false`;
  const queueName = `${config.rabbitQueuePrefix}-${config.instance}-${config.rabbitQueueSuffix}`;
  const body = JSON.stringify({
    type: 'exec',
    mbean: 'org.springframework.amqp.rabbit.core:name=getRabbitAdmin,type=RabbitAdmin',
    operation: 'purgeQueue(java.lang.String)',
    arguments: [queueName]
  });
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body
  });
  if (!resp.ok) throw new Error(`Purge queue HTTP ${resp.status}`);
  const json = await resp.json();
  return json;
}

// Отправка задач в отбор
export async function sendPlanning(token, baseUrl, config, grouped, strategyId) {
  const url = `http://${baseUrl}:8080/api/so/SOService/createTasks`;
  const sortedPriorities = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
  for (const p of sortedPriorities) {
    const ids = grouped[p];
    console.log(`📌 Приоритет ${p}: отправка ${ids.length} ID...`);
    const requestBody = {
      ids: ids,
      pickStrategyPolicyId: strategyId || config.pickStrategyPolicyId.standard,
      taskReleasePhases: config.taskReleasePhases,
      actions: config.actions,
      priority: parseInt(p, 10)
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!resp.ok) throw new Error(`Planning HTTP ${resp.status} for priority ${p}`);
    await resp.json();
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

// Отправка задач в отбор (версия для popup.js с батчингом)
export async function sendPlanningBatched(authHeaders, config, grouped, statusEl, logFn) {
  const url = `http://${config.baseUrl}:8080/api/so/SOService/createTasks`;
  const BATCH_SIZE = 100;
  const sortedPriorities = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

  for (const priority of sortedPriorities) {
    const ids = grouped[priority];
    logFn(`📌 Приоритет ${priority}: ${ids.length} ID`);
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const requestBody = {
        ids: batch,
        pickStrategyPolicyId: config.pickStrategyPolicyId.simplified,
        taskReleasePhases: config.taskReleasePhases,
        actions: config.actions
      };
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { ...authHeaders },
          body: JSON.stringify(requestBody)
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        await resp.json();
        logFn(`   ✅ Батч ${batchNum} (${batch.length} ID) отправлен`);
      } catch (err) {
        logFn(`   ❌ Батч ${batchNum}: ${err.message}`);
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}

// ======================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ========================

// Группировка ID по приоритету
export function groupByPriority(items) {
  const grouped = {};
  for (const { id, priority } of items) {
    if (!grouped[priority]) grouped[priority] = [];
    grouped[priority].push(id);
  }
  return grouped;
}

// Получение строк из DOM
export function getIdsFromDOMRaw() {
  const containers = document.querySelectorAll('app-screen-engine.active.ng-star-inserted');
  const ids = [];
  const pairs = {};
  containers.forEach(container => {
    const rows = container.querySelectorAll('tr.ng-star-inserted.active');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 12) {
        const idDiv = cells[2].querySelector('div[style*="text-align: right;"]');
        if (idDiv) {
          const id = idDiv.innerText.trim();
          if (id) {
            const priority = cells[10].innerText.trim();
            pairs[id] = priority || '0';
            ids.push(id);
          }
        }
      }
    });
  });
  return { ids, pairs };
}
