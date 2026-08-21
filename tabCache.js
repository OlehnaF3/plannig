// ======================== TAB CACHE ========================
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
    
    getActiveTabId() {
      return activeTabId !== null ? activeTabId : 0; //Есть проблемы при инициализации странцы 
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
                const prefix = `tab_${id}`;              
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