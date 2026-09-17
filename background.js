// background.js – service worker расширения
// Отвечает за: (1) логирование WMS-ответов по табам,
// (2) локальный ИИ-прогноз приоритетов.

importScripts('forecast.js', 'model.js', 'training.js', 'llm.js');

chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 Расширение установлено');
});

// ======================== КОНФИГУРАЦИЯ ХРАНИЛИЩА ========================
const STORAGE_PREFIX = 'log_';
const API_ENDPOINT = '/api/data/flexView/so.SO_H';
const MAX_LOG_SIZE = 100;
const LOG_KEY = 'plannig_log_v1';
const QUEUE_KEY = 'queue_stats_v1';

// ======================== ОБЩИЙ ЛОГ РАСШИРЕНИЯ ========================
function pushLog(message, level) {
  level = level || 'info';
  chrome.storage.local.get(LOG_KEY, (data) => {
    let log = (data && data[LOG_KEY]) ? data[LOG_KEY] : [];
    log.push({ t: Date.now(), message: String(message), level: level });
    if (log.length > 500) log = log.slice(-500);
    chrome.storage.local.set({ [LOG_KEY]: log });
  });
}

// ======================== ФУНКЦИИ РАБОТЫ С ХРАНИЛИЩЕМ ========================

/** Получить ключ storage для таба */
function getStorageKey(tabIndex) {
  if (tabIndex === null || tabIndex === undefined) return null;
  return `${STORAGE_PREFIX}${tabIndex}`;
}

/** Прочитать лог таба */
function readTabLog(tabIndex, callback) {
  const key = getStorageKey(tabIndex);
  if (!key) {
    console.warn('[Background] Невалидный tabIndex для чтения:', tabIndex);
    callback([]);
    return;
  }
  chrome.storage.local.get(key, (result) => {
    if (chrome.runtime.lastError) {
      console.error('[Background] Ошибка чтения:', chrome.runtime.lastError);
      callback([]);
      return;
    }
    callback(result[key] || []);
  });
}

/** Сохранить лог таба */
function writeTabLog(tabIndex, logArray, callback) {
  const key = getStorageKey(tabIndex);
  if (!key) {
    console.warn('[Background] Невалидный tabIndex для записи:', tabIndex);
    if (callback) callback();
    return;
  }
  if (logArray.length > MAX_LOG_SIZE) {
    logArray = logArray.slice(0, MAX_LOG_SIZE);
  }
  chrome.storage.local.set({ [key]: logArray }, () => {
    if (chrome.runtime.lastError) {
      console.error('[Background] Ошибка записи:', chrome.runtime.lastError);
    }
    if (callback) callback();
  });
}

/** Очистить лог таба */
function deleteTabLog(tabIndex, callback) {
  const key = getStorageKey(tabIndex);
  if (!key) {
    console.warn('[Background] Невалидный tabIndex для удаления:', tabIndex);
    if (callback) callback();
    return;
  }
  chrome.storage.local.remove(key, () => {
    console.log(`[Background] Очищен кэш для таба ${tabIndex}`);
    if (callback) callback();
  });
}

/** Очистить все логи вкладок */
function deleteAllTabLogs(callback) {
  chrome.storage.local.get(null, (result) => {
    const keysToDelete = [];
    for (const key in result) {
      if (key.startsWith(STORAGE_PREFIX)) {
        keysToDelete.push(key);
      }
    }
    if (keysToDelete.length > 0) {
      chrome.storage.local.remove(keysToDelete, () => {
        console.log(`[Background] Очищены все логи: ${keysToDelete.length} записей`);
        if (callback) callback();
      });
    } else {
      if (callback) callback();
    }
  });
}

// ======================== ОБРАБОТКА ЗАПИСЕЙ ========================

function addLogEntryToTab(tabIndex, entry, callback) {
  console.log('[Background] Получена запись для таба:', tabIndex);

  if (tabIndex === null || tabIndex === undefined) {
    console.warn('[Background] tabIndex is null/undefined, сохраняем во временный лог');
    const tempKey = 'log_temp';
    chrome.storage.local.get(tempKey, (result) => {
      const tempLog = result[tempKey] || [];
      tempLog.unshift({ ...entry, receivedAt: new Date().toISOString() });
      chrome.storage.local.set({ [tempKey]: tempLog.slice(0, 50) }, () => {
        console.log('[Background] Сохранено во временный лог');
        if (callback) callback();
      });
    });
    return;
  }

  if (!entry.url || !entry.url.includes(API_ENDPOINT)) {
    console.log('[Background] Пропущена запись (нецелевой эндпоинт):', entry.url);
    if (callback) callback();
    return;
  }

  tabIndex = parseInt(tabIndex, 10);
  if (isNaN(tabIndex)) {
    console.warn('[Background] Невалидный tabIndex:', tabIndex);
    if (callback) callback();
    return;
  }

  let shortData = null;
  let resultSize = null;

  try {
    if (!entry.responseBody) {
      console.warn('[Background] Пустой responseBody');
    } else {
      const parsed = JSON.parse(entry.responseBody);
      if (parsed.data && Array.isArray(parsed.data)) {
        const data = parsed.data;
        const totalRows = data.length;
        const columns = entry.requestInfo?.columns || entry.columns || [];
        let idIndex = columns.indexOf('soh.id');
        let pickPriorityIndex = columns.indexOf('soh.pickPriority');
        if (idIndex === -1) idIndex = 0;
        if (pickPriorityIndex === -1) pickPriorityIndex = 8;
        shortData = data.map((row, index) => {
          return [
            index,
            row[idIndex] !== undefined ? row[idIndex] : '',
            row[pickPriorityIndex] !== undefined ? row[pickPriorityIndex] : ''
          ];
        });
        resultSize = parsed.resultSize || totalRows;
      }
    }
  } catch (e) {
    console.warn('[Background] Не удалось распарсить ответ:', e);
  }

  const logEntry = {
    shortData: shortData,
    resultSize: resultSize,
    url: entry.url,
    timestamp: entry.timestamp || new Date().toISOString(),
    status: entry.status
  };

  readTabLog(tabIndex, (logArray) => {
    logArray.unshift(logEntry);
    writeTabLog(tabIndex, logArray, () => {
      console.log(`[Background] Сохранено для таба ${tabIndex}, всего записей: ${logArray.length}`);
      if (callback) callback();
    });
  });
}

// ======================== ФУНКЦИЯ ПРОГНОЗА ========================
function runPrediction() {
  var F = self.PlannigForecast;
  var M = self.PlannigModel;
  var L = self.PlannigLLM;

  if (!F || !M || !L) {
    return Promise.resolve({
      priority: null, waveSize: null, confidence: 'low',
      reason: 'Модули ИИ не загружены.', samples: 0, source: 'error'
    });
  }

  return F.predictBaseline().then(function (base) {
    return F.getHistory().then(function (history) {
      var x = F._featuresToVector(base.features);
      return M.loadModel().then(function (model) {
        if (model.meta && model.meta.trained) {
          var out = M.forward(x, model);
          base.priority = out.priority;
          base.confidence = out.confidence > 0.7 ? 'high' : 'medium';
          base.source = 'mlp';
          base.reason += ' (MLP)';
        } else {
          base.source = 'baseline';
        }
        if (L.isAvailable()) {
          return L.predict(base.features, history.slice(-15)).then(function (llmP) {
            if (llmP != null && base.priority != null) {
              var combined = Math.round((base.priority * 0.6 + llmP * 0.4) / 10) * 10;
              base.priority = M.snapToValid(combined);
              base.source = 'hybrid';
              base.reason += ' (+LLM)';
            }
            return base;
          });
        }
        return base;
      });
    });
  });
}

// ======================== ОБРАБОТЧИК СООБЩЕНИЙ ========================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const F = self.PlannigForecast;
  const M = self.PlannigModel;
  const T = self.PlannigTraining;

  const type = message && (message.type || message.action);
  console.log('[Background] Получено сообщение:', type);

  // ---------- 1. ЛОГИРОВАНИЕ WMS ----------

  if (message.type === 'response') {
    addLogEntryToTab(message.tabIndex, message, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'clearLog') {
    const tabIndex = message.tabIndex;
    if (tabIndex !== null && tabIndex !== undefined) {
      deleteTabLog(tabIndex, () => sendResponse({ success: true }));
    } else {
      deleteAllTabLogs(() => sendResponse({ success: true }));
    }
    return true;
  }

  if (message.action === 'getLog') {
    const tabIndex = message.tabIndex;
    if (tabIndex !== null && tabIndex !== undefined) {
      readTabLog(tabIndex, (log) => sendResponse({ log: log }));
    } else {
      chrome.storage.local.get(null, (result) => {
        const logs = {};
        for (const key in result) {
          if (key.startsWith(STORAGE_PREFIX)) logs[key] = result[key];
        }
        sendResponse({ logs: logs });
      });
    }
    return true;
  }

  if (message.action === 'ping') {
    sendResponse({ pong: true });
    return true;
  }

  // ---------- 2. ЛОКАЛЬНЫЙ ИИ ----------

  if (message.type === 'forecast:track') {
    if (!F) { sendResponse({ ok: false, error: 'forecast module not loaded' }); return true; }
    F.track(message.eventType, message.payload).then(function () {
      if (message.eventType === 'queue_cleared') {
        chrome.storage.local.set({ [QUEUE_KEY]: { messages: 0, lastClearedAt: Date.now() } });
        pushLog('Очередь RabbitMQ очищена.', 'success');
      } else if (message.eventType === 'wave_reset') {
        pushLog('Сброс волн выполнен.', 'info');
      } else if (message.eventType === 'wave_created') {
        pushLog('Перестроение приоритетов.', 'info');
      } else if (message.eventType === 'priority_set') {
        pushLog('Приоритет установлен: ' + (message.payload && message.payload.priority != null ? message.payload.priority : '—'), 'info');
      }
      sendResponse({ ok: true });
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'forecast:predict') {
    runPrediction().then(function (data) {
      sendResponse({ ok: true, data: data });
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'forecast:feedback') {
    if (!F) { sendResponse({ ok: false }); return true; }
    F.feedback(message.predicted, message.actual).then(function () {
      sendResponse({ ok: true });
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'forecast:train') {
    if (!T) { sendResponse({ ok: false, error: 'training module not loaded' }); return true; }
    T.trainFromHistory(message.opts || {}).then(function (r) {
      if (r.ok) pushLog('Модель обучена на ' + r.samples + ' примерах.', 'success');
      else pushLog('Ошибка обучения: ' + r.error, 'error');
      sendResponse(r);
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'forecast:validate') {
    if (!T) { sendResponse({ ok: false, error: 'training module not loaded' }); return true; }
    T.validate().then(function (r) {
      if (r.ok) pushLog('Валидация: MAE ' + r.maeSteps.toFixed(2) + ' шагов.', 'info');
      else pushLog('Ошибка валидации: ' + r.error, 'error');
      sendResponse(r);
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'forecast:clear') {
    if (!F) { sendResponse({ ok: false }); return true; }
    F.clearHistory().then(function () {
      pushLog('История операций очищена.', 'warn');
      sendResponse({ ok: true });
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'forecast:history-stats') {
    if (!F) { sendResponse({ ok: false }); return true; }
    F.getHistory().then(function (h) {
      var now = Date.now();
      var hour = h.filter(function (e) { return now - e.recordedAt < 3600000; }).length;
      sendResponse({ ok: true, data: { total: h.length, lastHour: hour } });
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'model:status') {
    if (!M) { sendResponse({ ok: false }); return true; }
    M.loadModel().then(function (m) {
      var meta = m.meta || {};
      sendResponse({ ok: true, data: {
        trained: !!meta.trained,
        samples: meta.samples || 0,
        lastTrainedAt: meta.lastTrainedAt || null,
        maeSteps: meta.maeSteps || null
      }});
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'model:export') {
    if (!M) { sendResponse({ ok: false, error: 'model module not loaded' }); return true; }
    M.exportModel().then(function (json) {
      sendResponse({ ok: true, json: json });
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  if (message.type === 'model:import') {
    if (!M) { sendResponse({ ok: false, error: 'model module not loaded' }); return true; }
    try {
      M.importModel(message.json).then(function () {
        pushLog('Веса модели импортированы.', 'success');
        sendResponse({ ok: true });
      }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }

  if (message.type === 'queue:stats') {
    chrome.storage.local.get(QUEUE_KEY, function (data) {
      var s = data && data[QUEUE_KEY] ? data[QUEUE_KEY] : {};
      sendResponse({ ok: true, data: {
        messages: s.messages != null ? s.messages : null,
        lastClearedAt: s.lastClearedAt || null
      }});
    });
    return true;
  }

  if (message.type === 'queue:clear') {
    chrome.storage.local.set({ [QUEUE_KEY]: { messages: 0, lastClearedAt: Date.now() } },
      function () {
        pushLog('Очередь очищена из popup.', 'success');
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message.type === 'log:get') {
    chrome.storage.local.get(LOG_KEY, function (data) {
      sendResponse({ ok: true, data: data && data[LOG_KEY] ? data[LOG_KEY] : [] });
    });
    return true;
  }

  if (message.type === 'log:clear') {
    chrome.storage.local.remove(LOG_KEY, function () { sendResponse({ ok: true }); });
    return true;
  }

  if (message.type === 'llm:chat') {
    var L = self.PlannigLLM;
    if (!L || !L.isAvailable()) {
      sendResponse({ ok: false, error: 'LLM not available' });
      return true;
    }
    L.predict(message.text, []).then(function (reply) {
      sendResponse({ ok: true, reply: reply });
    }).catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  // ---------- 3. ФИНАЛЬНЫЙ FALLBACK ----------
  console.warn('[Background] Неизвестное сообщение:', message);
  sendResponse({ success: false, error: 'Unknown message type: ' + type });
  return true;
});

// ======================== ДОПОЛНИТЕЛЬНЫЕ ОБРАБОТЧИКИ ========================
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('[Background] Вкладка закрыта:', tabId);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('log_temp', () => {
    console.log('[Background] Временный лог очищен');
  });
});

// Проверка LLM при старте
try {
  self.PlannigLLM.checkAvailability().then(function (ok) {
    console.log('[Plannig] LLM available:', ok);
  });
} catch (e) {
  console.warn('[Plannig] LLM check failed:', e);
}

console.log('[Background] Service worker загружен и готов к работе');