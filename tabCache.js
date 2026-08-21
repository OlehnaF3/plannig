// ======================== TAB CACHE ========================
// Логика из pinner-: хранение данных отдельно для каждой вкладки (по индексу)
// Использует MutationObserver для отслеживания переключения вкладок

(function() {
  'use strict';

  // ============================
  //  НАСТРОЙКИ
  // ============================
  const CONTAINER_SELECTOR = '#tabs.cdk-drop-list.tabs-list';
  const TAB_BUTTON_SELECTOR = '.tab-item';
  const SELECTED_CLASS = 'tab-item__selected';

  // ============================
  //  СОСТОЯНИЕ
  // ============================
  let activeTabId = null;
  let currentContainer = null;
  let classObserver = null;
  let deleteObserver = null;
  let containerObserver = null;

  // ---- Определение ID вкладки (индекс) ----
  function getTabId(buttonElement) {
    const host = buttonElement.closest('app-tab-item');
    if (!host) return null;
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) return null;
    const items = container.querySelectorAll('app-tab-item');
    return Array.from(items).indexOf(host);
  }

  // ---- API для работы с хранилищем ----
  window.TabCache = {
    // Асинхронное получение значения
    async getItem(key) {
      if (activeTabId === null || activeTabId === undefined) return null;
      const storageKey = `tab_${activeTabId}_${key}`;
      
      try {
        const result = await chrome.storage.local.get(storageKey);
        return result[storageKey] || null;
      } catch (error) {
        console.error('[TabCache] Ошибка чтения из chrome.storage:', error);
        return null;
      }
    },
    
    // Асинхронная запись значения
    async setItem(key, value) {
      if (activeTabId === null || activeTabId === undefined) return false;
      const storageKey = `tab_${activeTabId}_${key}`;
      
      try {
        await chrome.storage.local.set({ [storageKey]: value });
        console.log(`[TabCache] Сохранено: ${storageKey}`);
        return true;
      } catch (error) {
        console.error('[TabCache] Ошибка записи в chrome.storage:', error);
        return false;
      }
    },
    
    // Асинхронное удаление значения
    async removeItem(key) {
      if (activeTabId === null || activeTabId === undefined) return false;
      const storageKey = `tab_${activeTabId}_${key}`;
      
      try {
        await chrome.storage.local.remove(storageKey);
        return true;
      } catch (error) {
        console.error('[TabCache] Ошибка удаления из chrome.storage:', error);
        return false;
      }
    },
    
    getActiveTabId() {
      return activeTabId !== null ? activeTabId : 0; //Есть проблемы при инициализации странцы 
    },
    
    // Асинхронная очистка данных текущей вкладки
    async clearCurrentTab() {
      if (activeTabId === null || activeTabId === undefined) return false;
      const prefix = `tab_${activeTabId}_`;
      
      try {
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allData).filter(k => k.startsWith(prefix));
        
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          console.log(`[TabCache] Очищено ${keysToRemove.length} ключей для вкладки ${activeTabId}`);
        }
        return true;
      } catch (error) {
        console.error('[TabCache] Ошибка очистки chrome.storage:', error);
        return false;
      }
    },
    
    // Асинхронное получение всех ключей текущей вкладки
    async getAllKeys() {
      if (activeTabId === null || activeTabId === undefined) return [];
      const prefix = `tab_${activeTabId}_`;
      
      try {
        const allData = await chrome.storage.local.get(null);
        return Object.keys(allData)
          .filter(k => k.startsWith(prefix))
          .map(k => k.replace(prefix, ''));
      } catch (error) {
        console.error('[TabCache] Ошибка получения ключей:', error);
        return [];
      }
    }
  };

  // ---- Переключение на новый таб ----
  function switchToTab(buttonElement) {
    const newId = getTabId(buttonElement);
    if (newId === null || newId === undefined) {
      console.warn('[TabCache] Не удалось определить ID таба');
      return;
    }
    if (newId === activeTabId) return;

    activeTabId = newId;
    console.log(`[TabCache] Переключились на таб с индексом ${activeTabId}`);
  }

  // ---- Обновление состояния выделенности ----
  const selectedState = new WeakMap();

  function updateSelectedState(button) {
    const isSelected = button.classList.contains(SELECTED_CLASS);
    const prev = selectedState.get(button);
    if (prev !== undefined && prev !== isSelected) {
      if (isSelected) {
        switchToTab(button);
      }
    }
    selectedState.set(button, isSelected);
  }

  // ---- Подключение наблюдателей к контейнеру ----
  function attachObservers(container) {
    if (!container) return;

    // Отключаем старых наблюдателей, если есть
    if (classObserver) classObserver.disconnect();
    if (deleteObserver) deleteObserver.disconnect();

    // 1. Наблюдатель за изменением класса у кнопок
    classObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.matches && target.matches(TAB_BUTTON_SELECTOR)) {
            updateSelectedState(target);
          }
        }
      });
    });
    classObserver.observe(container, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true
    });

    // 2. Наблюдатель за удалением вкладок (очистка данных)
    deleteObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.removedNodes.forEach(async node => {
          if (node.nodeType === 1 && node.matches && node.matches('app-tab-item')) {
            const btn = node.querySelector(TAB_BUTTON_SELECTOR);
            if (btn) {
              const id = getTabId(btn);
              if (id !== null && id !== undefined) {
                const prefix = `tab_${id}_`;
                
                // Очистка данных в chrome.storage.local
                try {
                  const allData = await chrome.storage.local.get(null);
                  const keysToRemove = Object.keys(allData).filter(k => k.startsWith(prefix));
                  
                  if (keysToRemove.length > 0) {
                    await chrome.storage.local.remove(keysToRemove);
                    console.log(`[TabCache] Удалены данные для вкладки ${id}`);
                  }
                } catch (error) {
                  console.error('[TabCache] Ошибка очистки данных вкладки:', error);
                }
                
                // Очистка данных в background storage
                try {
                  chrome.runtime.sendMessage({
                    action: 'clearLog',
                    tabIndex: id
                  }, (response) => {
                    if (chrome.runtime.lastError) {
                      console.warn('[TabCache] Не удалось соединиться с background:', chrome.runtime.lastError.message);
                    } else {
                      console.log(`[TabCache] Background подтвердил очистку для таба ${id}`);
                    }
                  });
                } catch (e) {
                  console.warn('[TabCache] Ошибка отправки сообщения в background:', e);
                }
              }
            }
          }
        });
      });
    });
    deleteObserver.observe(container, { childList: true, subtree: true });

    // Инициализация состояния для уже существующих кнопок
    const buttons = container.querySelectorAll(TAB_BUTTON_SELECTOR);
    let foundActive = false;
    buttons.forEach(btn => {
      const isSelected = btn.classList.contains(SELECTED_CLASS);
      selectedState.set(btn, isSelected);
      if (isSelected) {
        switchToTab(btn);
        foundActive = true;
      }
    });
    if (!foundActive && buttons.length > 0) {
      // Опционально: активировать первую вкладку, если ни одна не активна
		switchToTab(buttons[0]);
    }
    console.log(`[TabCache] Наблюдатели подключены, активный таб: ${activeTabId}`);
  }

  // ---- Отключение наблюдателей (при удалении контейнера) ----
  function detachObservers() {
    if (classObserver) {
      classObserver.disconnect();
      classObserver = null;
    }
    if (deleteObserver) {
      deleteObserver.disconnect();
      deleteObserver = null;
    }
    activeTabId = null;
    console.log('[TabCache] Наблюдатели отключены');
  }

  // ---- Поиск и подключение к контейнеру ----
  function tryInit() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (container) {
      if (currentContainer !== container) {
        if (currentContainer) detachObservers();
        currentContainer = container;
        attachObservers(container);
      }
    } else {
      if (currentContainer) {
        detachObservers();
        currentContainer = null;
      }
    }
  }

  // ---- Главный наблюдатель за появлением/исчезновением контейнера ----
  function startRootObserver() {
    containerObserver = new MutationObserver(() => {
      tryInit();
    });
    containerObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    tryInit();
  }

  // Запускаем, когда DOM готов
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRootObserver);
  } else {
    startRootObserver();
  }

})();