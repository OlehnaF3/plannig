chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 Установлен');
});

// ======================== ХРАНИЛИЩЕ ПО ВКЛАДКАМ ========================
// Формат ключей: 'log_{tabIndex}' -> массив данных
// Используем callback-style API для надёжности с service workers

const STORAGE_PREFIX = 'log_';
const API_ENDPOINT = '/api/data/flexView/so.SO_H';

/** Получить ключ storage для таба */
function getStorageKey(tabIndex) {
  if (tabIndex === null || tabIndex === undefined) return null;
  return `${STORAGE_PREFIX}${tabIndex}`;
}

/** Прочитать лог таба (callback-style) */
function readTabLog(tabIndex, callback) {
  const key = getStorageKey(tabIndex);
  if (!key) {
    callback([]);
    return;
  }
  chrome.storage.local.get(key, (result) => {
    callback(result[key] || []);
  });
}

/** Сохранить лог таба (callback-style) */
function writeTabLog(tabIndex, logArray, callback) {
  const key = getStorageKey(tabIndex);
  if (!key) {
    if (callback) callback();
    return;
  }
  // Ограничиваем размер лога
  if (logArray.length > 100) {
    logArray = logArray.slice(0, 100);
  }
  chrome.storage.local.set({ [key]: logArray }, () => {
    if (callback) callback();
  });
}

/** Очистить лог таба (callback-style) */
function deleteTabLog(tabIndex, callback) {
  const key = getStorageKey(tabIndex);
  if (!key) {
    if (callback) callback();
    return;
  }
  chrome.storage.local.remove(key, () => {
    console.log(`[TabLog] Очищен кэш для таба ${tabIndex}`);
    if (callback) callback();
  });
}

/** Очистить все логи вкладок (callback-style) */
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
        console.log(`[TabLog] Очистжены все логи: ${keysToDelete.length} записей`);
        if (callback) callback();
      });
    } else {
      if (callback) callback();
    }
  });
}

/**
 * Добавить запись в лог таба (async-safe callback pattern)
 * Важно: используем callback-style для надёжности с Chrome service workers
 */
function addLogEntryToTab(tabIndex, entry, callback) {
  // Фильтр: только нужный эндпоинт
  if (!entry.url || !entry.url.includes(API_ENDPOINT)) {
    if (callback) callback();
    return;
  }

  // Валидация tabIndex: только числа >= 0
  if (tabIndex === null || tabIndex === undefined || (typeof tabIndex !== 'number' && typeof tabIndex !== 'string')) {
    console.warn('[TabLog] Пропущена запись: невалидный tabIndex', tabIndex);
    if (callback) callback();
    return;
  }

  // Преобразуем string tabIndex в number
  tabIndex = parseInt(tabIndex, 10);
  if (isNaN(tabIndex)) {
    console.warn('[TabLog] Пропущена запись: tabIndex не является числом', tabIndex);
    if (callback) callback();
    return;
  }

  let shortData = null;
  let resultSize = null;

  try {
    if (!entry.responseBody) {
      console.warn('[TabLog] Пустой responseBody');
    } else {
      const parsed = JSON.parse(entry.responseBody);
      if (parsed.data && Array.isArray(parsed.data)) {
        const data = parsed.data;
        const totalRows = data.length;

        const columns = entry.columns || [];
        let idIndex = columns.indexOf('soh.id');
        let pickPriorityIndex = columns.indexOf('soh.pickPriority');

        if (idIndex === -1) idIndex = 0;
        if (pickPriorityIndex === -1) pickPriorityIndex = 8;

        shortData = data.map((row, index) => {
          const rowNumber = index;
          const id = row[idIndex] !== undefined ? row[idIndex] : '';
          const priority = row[pickPriorityIndex] !== undefined ? row[pickPriorityIndex] : '';
          return [rowNumber, id, priority];
        });

        resultSize = parsed.resultSize || totalRows;
      }
    }
  } catch (e) {
    console.warn('[TabLog] Не удалось распарсить ответ:', e);
  }

  const logEntry = {
    shortData: shortData,
    resultSize: resultSize
  };

  // Читаем, модифицируем, пишем — без await
  readTabLog(tabIndex, (logArray) => {
    logArray.unshift(logEntry);
    writeTabLog(tabIndex, logArray, () => {
      console.log(`[TabLog] Сохранено для таба ${tabIndex}, всего: ${logArray.length}`);
      if (callback) callback();
    });
  });
}

// ======================== ОБРАБОТЧИКИ СООБЩЕНИЙ ========================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // response — добавляем запись в лог таба
  if (message.type === 'response') {
    addLogEntryToTab(message.tabIndex, message, () => {
      sendResponse({ success: true });
    });
    return true; // асинхронный ответ
  }

  // clearLog — очищаем лог таба или все логи
  if (message.action === 'clearLog') {
    const tabIndex = message.tabIndex;
    if (tabIndex !== null && tabIndex !== undefined) {
      deleteTabLog(tabIndex, () => {
        sendResponse({ success: true });
      });
    } else {
      deleteAllTabLogs(() => {
        sendResponse({ success: true });
      });
    }
    return true; // асинхронный ответ
  }

  // getLog — получаем лог таба или все логи
  if (message.action === 'getLog') {
    const tabIndex = message.tabIndex;
    if (tabIndex !== null && tabIndex !== undefined) {
      readTabLog(tabIndex, (log) => {
        sendResponse({ log: log });
      });
    } else {
      // Возвращаем все логи
      chrome.storage.local.get(null, (result) => {
        const logs = {};
        for (const key in result) {
          if (key.startsWith(STORAGE_PREFIX)) {
            logs[key] = result[key];
          }
        }
        sendResponse({ logs: logs });
      });
    }
    return true; // асинхронный ответ
  }

  // ping — проверка соединения
  if (message.action === 'ping') {
    sendResponse({ pong: true });
    return true;
  }

  return true;
});