// background.js – service worker расширения
// Отвечает за сохранение данных в chrome.storage.local

chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 Расширение установлено');
});

// ======================== КОНФИГУРАЦИЯ ХРАНИЛИЩА ========================
const STORAGE_PREFIX = 'log_';
const API_ENDPOINT = '/api/data/flexView/so.SO_H';
const MAX_LOG_SIZE = 100;

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
  
  // Ограничиваем размер лога
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

/**
 * Добавить запись в лог таба
 * Обрабатывает ответ от content.js
 */
function addLogEntryToTab(tabIndex, entry, callback) {
  console.log('[Background] Получена запись для таба:', tabIndex);
  
  // Проверка на null/undefined tabIndex
  if (tabIndex === null || tabIndex === undefined) {
    console.warn('[Background] tabIndex is null/undefined, сохраняем во временный лог');
    
    // Сохраняем во временный лог для последующей обработки
    const tempKey = 'log_temp';
    chrome.storage.local.get(tempKey, (result) => {
      const tempLog = result[tempKey] || [];
      tempLog.unshift({
        ...entry,
        receivedAt: new Date().toISOString()
      });
      
      chrome.storage.local.set({ [tempKey]: tempLog.slice(0, 50) }, () => {
        console.log('[Background] Сохранено во временный лог');
        if (callback) callback();
      });
    });
    return;
  }
  
  // Фильтр: только нужный эндпоинт
  if (!entry.url || !entry.url.includes(API_ENDPOINT)) {
    console.log('[Background] Пропущена запись (нецелевой эндпоинт):', entry.url);
    if (callback) callback();
    return;
  }
  
  // Преобразуем tabIndex в число
  tabIndex = parseInt(tabIndex, 10);
  if (isNaN(tabIndex)) {
    console.warn('[Background] Невалидный tabIndex:', tabIndex);
    if (callback) callback();
    return;
  }
  
  // Обрабатываем данные ответа
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
            index, // номер строки
            row[idIndex] !== undefined ? row[idIndex] : '', // id
            row[pickPriorityIndex] !== undefined ? row[pickPriorityIndex] : '' // приоритет
          ];
        });
        
        resultSize = parsed.resultSize || totalRows;
      }
    }
  } catch (e) {
    console.warn('[Background] Не удалось распарсить ответ:', e);
  }
  
  const hasRealData = shortData.some(row => row[1] !== '' || row[2] !== '');
if (!hasRealData) {
  console.log('[Background] Все записи пустые (ID и приоритет отсутствуют), пропускаем сохранение');
  if (callback) callback();
  return;
}
  const logEntry = {
    shortData: shortData,
    resultSize: resultSize,
    url: entry.url,
    timestamp: entry.timestamp || new Date().toISOString(),
    status: entry.status
  };
  
  // Читаем, модифицируем, пишем
  readTabLog(tabIndex, (logArray) => {
    logArray.unshift(logEntry);
    writeTabLog(tabIndex, logArray, () => {
      console.log(`[Background] Сохранено для таба ${tabIndex}, всего записей: ${logArray.length}`);
      if (callback) callback();
    });
  });
}

// ======================== ОБРАБОТЧИКИ СООБЩЕНИЙ ========================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Получено сообщение:', message.type || message.action);
  
  // Обработка перехваченного ответа
  if (message.type === 'response') {
    addLogEntryToTab(message.tabIndex, message, () => {
      sendResponse({ success: true });
    });
    return true; // асинхронный ответ
  }
  
  // Очистка лога таба или всех логов
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
    return true;
  }
  
  // Получение лога таба или всех логов
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
    return true;
  }
  
  // Проверка соединения
  if (message.action === 'ping') {
    sendResponse({ pong: true });
    return true;
  }
  
  // Неизвестное сообщение
  console.warn('[Background] Неизвестное сообщение:', message);
  sendResponse({ success: false, error: 'Unknown message type' });
  return true;
});

// ======================== ДОПОЛНИТЕЛЬНЫЕ ОБРАБОТЧИКИ ========================

// Очистка при закрытии вкладки
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('[Background] Вкладка закрыта:', tabId);
  // Здесь можно очистить данные для закрытой вкладки
});

// Очистка временного лога при запуске
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('log_temp', () => {
    console.log('[Background] Временный лог очищен');
  });
});

console.log('[Background] Service worker загружен и готов к работе');