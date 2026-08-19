chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 Установлен');
});

// ======================== ХРАНИЛИЩЕ ПО ВКЛАДКАМ ========================
// Формат ключей: 'log_{tabIndex}' -> массив данных

const STORAGE_PREFIX = 'log_';

async function getLogStorage() {
  const result = await chrome.storage.local.get(null);
  const logs = {};
  for (const key in result) {
    if (key.startsWith(STORAGE_PREFIX)) {
      logs[key] = result[key];
    }
  }
  return logs;
}

async function getLogForTab(tabIndex) {
  const key = `${STORAGE_PREFIX}${tabIndex}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || [];
}

async function saveLogForTab(tabIndex, logArray) {
  const key = `${STORAGE_PREFIX}${tabIndex}`;
  if (logArray.length > 100) logArray.pop();
  await chrome.storage.local.set({ [key]: logArray });
}

async function addLogEntryToTab(tabIndex, entry) {
  // Фильтр: только нужный эндпоинт
  if (!entry.url.includes('/api/data/flexView/so.SO_H')) {
    return;
  }

  if (!tabIndex && tabIndex !== 0) return;

  let shortData = null;
  let resultSize = null;
  const columns = entry.columns || [];
  const pageSize = entry.pageSize || null;

  try {
    const parsed = JSON.parse(entry.responseBody);
    if (parsed.data && Array.isArray(parsed.data)) {
      const data = parsed.data;
      const totalRows = data.length;

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
  } catch (e) {
    console.warn('Не удалось распарсить ответ:', e);
  }

  const logEntry = {
    shortData: shortData,
    resultSize: resultSize
  };

  const logArray = await getLogForTab(tabIndex);
  logArray.unshift(logEntry);
  await saveLogForTab(tabIndex, logArray);
  console.log(`[TabLog] Сохранено для таба ${tabIndex}, всего: ${logArray.length}`);
}

async function clearLogForTab(tabIndex) {
  const key = `${STORAGE_PREFIX}${tabIndex}`;
  await chrome.storage.local.remove(key);
  console.log(`[TabLog] Очищен кэш для таба ${tabIndex}`);
}

// Принимаем сообщения от content.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'response') {
    const tabIndex = message.tabIndex !== undefined ? message.tabIndex : null;
    await addLogEntryToTab(tabIndex, message);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'clearLog') {
    const tabIndex = message.tabIndex !== undefined ? message.tabIndex : null;
    if (tabIndex !== null) {
      await clearLogForTab(tabIndex);
    } else {
      // Очистка всех вкладок
      const logs = await getLogStorage();
      await chrome.storage.local.remove(Object.keys(logs));
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getLog') {
    const tabIndex = message.tabIndex !== undefined ? message.tabIndex : null;
    if (tabIndex !== null) {
      const log = await getLogForTab(tabIndex);
      sendResponse({ log: log });
    } else {
      const logs = await getLogStorage();
      sendResponse({ logs: logs });
    }
    return true;
  }

  if (message.action === 'ping') {
    sendResponse({ pong: true });
    return true;
  }

  return true;
});