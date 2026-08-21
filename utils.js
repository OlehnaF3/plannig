// ======================== ОБЩИЕ УТИЛИТЫ ========================
// Этот файл подключается как обычный скрипт (content_scripts + popup.html)

// ======================== ТОКЕН И DOM ========================

// Получение токена из различных источников
function getToken() {
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

// Асинхронное получение ID из DOM с маппингом на лог
function getIdsFromDOM() {
  //.   console.log('[LOG] getIdsFromDOM вызвана');

  const containers = document.querySelectorAll('app-screen-engine.active.ng-star-inserted');
  //.  console.log(`[LOG] Найдено контейнеров: ${containers.length}`);

  let activeRowNumbers = [];
  containers.forEach((container, idx) => {
  //.  console.log(`[LOG] Обработка контейнера #${idx}`);
    const rows = container.querySelectorAll('tr.ng-star-inserted.active');
  //.   console.log(`[LOG]   В контейнере найдено активных строк: ${rows.length}`);

    rows.forEach(row => {
      const rowNumber = row.getAttribute('data-row-index');
      if (rowNumber) {
        activeRowNumbers.push(rowNumber);
        //. console.log(`[LOG]   Добавлен номер строки: ${rowNumber}`);
      } else {
        console.warn('[WARN] Строка без data-row-index');
      }
    });
  });

  //. console.log(`[LOG] Итоговый массив номеров строк (${activeRowNumbers.length} шт.):`, activeRowNumbers);

  // Возвращаем результат вызова matchActiveRowsWithLog
  //. console.log('[LOG] Вызов matchActiveRowsWithLog');
  return matchActiveRowsWithLog(activeRowNumbers);
}

function matchActiveRowsWithLog(activeRowNumbers) {
  //. console.log('[LOG] matchActiveRowsWithLog вызвана с аргументом:', activeRowNumbers);

  return new Promise((resolve, reject) => {
    //. console.log('[LOG] Внутри промиса matchActiveRowsWithLog');

    if (!activeRowNumbers || !activeRowNumbers.length) {
     //. console.warn('[WARN] activeRowNumbers пуст или отсутствует — разрешаем с []');
      resolve([]);
      return;
    }

   //. console.log('[LOG] activeRowNumbers содержит элементы, продолжаем');

    const tabIndex = (typeof window.TabCache !== 'undefined') ? window.TabCache.getActiveTabId() : null;
    //. console.log(`[LOG] tabIndex = ${tabIndex} (${typeof window.TabCache !== 'undefined' ? 'TabCache определён' : 'TabCache НЕ определён'})`);

    //. console.log('[LOG] Отправка chrome.runtime.sendMessage с action=getLog');
    chrome.runtime.sendMessage({ action: 'getLog', tabIndex: tabIndex }, (response) => {
      //. console.log('[LOG] Получен ответ от background (в колбэке sendMessage)');

      if (chrome.runtime.lastError) {
       //. console.error('[ERROR] chrome.runtime.lastError:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }

     //. console.log('[LOG] Ответ response:', response);

      const log = response.log || [];
      //console.log(`[LOG] Размер полученного лога: ${log.length} записей`);

      if (!log.length) {
       //. console.warn('[WARN] Лог пуст — разрешаем с []');
        resolve([]);
        return;
      }

     //. console.log('[LOG] Начинаем поиск соответствий для каждого номера строки');

      const results = [];
      activeRowNumbers.forEach(activeNum => {
        //. console.log(`[LOG] Обработка номера строки: ${activeNum}`);
        const num = parseInt(activeNum, 10);
        if (isNaN(num)) {
          console.warn(`[WARN] Невозможно преобразовать "${activeNum}" в число — пропускаем`);
          return;
        }

        let found = null;
        for (let entry of log) {
          if (entry.shortData && Array.isArray(entry.shortData)) {
            const match = entry.shortData.find(row => row[0] === num);
            if (match) {
              found = { 
                id: match[1],
                priority: match[2]
              };
             //. console.log(`[LOG] Найдено совпадение в логе для номера ${num}:`, found);
              break;
            }
          }
        }

        if (found) {
          results.push(found);
          //console.log(`Строка №${activeNum}: ID=${found.id}, Приоритет=${found.priority}`);
        } else {
          console.warn(`Для строки №${activeNum} не найдено данных в логе.`);
        }
      });

     //. console.log(`[LOG] Итоговый массив результатов (${results.length} элементов):`, results);
      resolve(results);
    });
  });
}


// Получение ID из DOM через сообщение Chrome (для popup)
async function fetchIdsFromDOM(chrome) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { ids: [], pairs: {} };
    
    // Получаем tabIndex
    const tabIndexResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getTabIndex' });
    const tabIndex = tabIndexResponse?.tabIndex !== undefined ? tabIndexResponse.tabIndex : null;
    
    if (tabIndex === null) return { ids: [], pairs: {} };
    
    // Получаем лог для этого таба
    const logResponse = await chrome.tabs.sendMessage(tab.id, {
      action: 'getLog',
      tabIndex: tabIndex
    });
    
    const log = logResponse?.log || [];
    return parseLogToPairs(log);
  } catch (error) {
    console.error('Ошибка получения ID из DOM:', error);
    return { ids: [], pairs: {} };
  }
}

// Парсинг лога в пары id->priority
function parseLogToPairs(log) {
  const ids = [];
  const pairs = {};
  if (!log || !Array.isArray(log)) return { ids, pairs };
  
  log.forEach(entry => {
    if (entry.shortData && Array.isArray(entry.shortData)) {
      entry.shortData.forEach(row => {
        if (row.length >= 2) {
          ids.push(row[1]);
          pairs[row[1]] = row[2] || '0';
        }
      });
    }
  });
  return { ids, pairs };
}

// ======================== API ФУНКЦИИ ========================

// Получение данных из FlexView
async function fetchFlexView(token, baseUrl) {
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
async function performDownloadReport(token, baseUrl, idReport) {
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
async function performPurgeQueue(token, baseUrl, config) {
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

// Отправка задач в отбор (без батчинга, для content.js)
async function sendPlanning(token, baseUrl, config, grouped, strategyId) {
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
async function sendPlanningBatched(authHeaders, config, grouped, statusEl, logFn) {
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
function groupByPriority(items) {
  const grouped = {};
  for (const { id, priority } of items) {
    if (!grouped[priority]) grouped[priority] = [];
    grouped[priority].push(id);
  }
  return grouped;
}

// ======================== UI УТИЛИТЫ (для popup.js) ========================

// Форматирование токена для отображения
function formatTokenDisplay(token) {
  return token.length > 20 ? `${token.substring(0, 15)}…${token.substring(token.length - 5)}` : token;
}

// Обновление статуса в popup
function updateStatus(statusEl, text, className) {
  statusEl.textContent = text;
  statusEl.className = className;
}

// Загрузка (спиннер) в popup
function setLoading(loading, visible) {
  loading.style.display = visible ? 'block' : 'none';
}

// ======================== EXPOSE FOR ES MODULE (popup.html) ========================
if (typeof window !== 'undefined') {
  window.Utils = {
    getToken,
    getIdsFromDOM,
    fetchIdsFromDOM,
    parseLogToPairs,
    fetchFlexView,
    performDownloadReport,
    performPurgeQueue,
    sendPlanning,
    sendPlanningBatched,
    groupByPriority,
    formatTokenDisplay,
    updateStatus,
    setLoading
  };
}
