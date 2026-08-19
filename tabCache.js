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
  let classObserver = null;       // наблюдатель за изменением класса у кнопок
  let deleteObserver = null;     // наблюдатель за удалением вкладок
  let containerObserver = null;  // наблюдатель за появлением контейнера

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
    getItem(key) {
      if (activeTabId === null || activeTabId === undefined) return null;
      return localStorage.getItem(`tab_${activeTabId}_${key}`);
    },
    setItem(key, value) {
      if (activeTabId === null || activeTabId === undefined) return;
      localStorage.setItem(`tab_${activeTabId}_${key}`, value);
    },
    removeItem(key) {
      if (activeTabId === null || activeTabId === undefined) return;
      localStorage.removeItem(`tab_${activeTabId}_${key}`);
    },
    getActiveTabId() {
      return activeTabId;
    },
    clearCurrentTab() {
      if (activeTabId === null) return;
      const prefix = `tab_${activeTabId}_`;
      Object.keys(localStorage)
        .filter(k => k.startsWith(prefix))
        .forEach(k => localStorage.removeItem(k));
    },
    getAllKeys() {
      if (activeTabId === null) return [];
      const prefix = `tab_${activeTabId}_`;
      return Object.keys(localStorage)
        .filter(k => k.startsWith(prefix))
        .map(k => k.replace(prefix, ''));
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

    // (Опционально) сохранить состояние старого таба
    // if (activeTabId !== null) { ... }

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
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === 1 && node.matches && node.matches('app-tab-item')) {
            const btn = node.querySelector(TAB_BUTTON_SELECTOR);
            if (btn) {
              const id = getTabId(btn);
              if (id !== null) {
                const prefix = `tab_${id}_`;
                Object.keys(localStorage)
                  .filter(k => k.startsWith(prefix))
                  .forEach(k => localStorage.removeItem(k));
                console.log(`[TabCache] Удалены данные для вкладки ${id}`);
                
                // Очистка данных в background storage с обработкой ошибок
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
      // switchToTab(buttons[0]);
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
    // Сбрасываем состояние, но оставляем activeTabId? Можно оставить, чтобы при повторном появлении контейнера оно сохранилось.
    // Но лучше сбросить, так как вкладки будут новыми.
    activeTabId = null;
    // Очищаем WeakMap (не нужно, он сам очистится при сборке мусора)
    console.log('[TabCache] Наблюдатели отключены');
  }

  // ---- Поиск и подключение к контейнеру ----
  function tryInit() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (container) {
      // Если контейнер уже есть, подключаемся
      if (currentContainer !== container) {
        // Если был другой контейнер, отключаем старых наблюдателей
        if (currentContainer) detachObservers();
        currentContainer = container;
        attachObservers(container);
      }
      // Если контейнер тот же, ничего не делаем
    } else {
      // Контейнер отсутствует – отключаем наблюдателей, если они были
      if (currentContainer) {
        detachObservers();
        currentContainer = null;
      }
    }
  }

  // ---- Главный наблюдатель за появлением/исчезновением контейнера ----
  function startRootObserver() {
    // Наблюдаем за всем document, чтобы поймать появление контейнера
    containerObserver = new MutationObserver(() => {
      tryInit();
    });
    containerObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    // Первая проверка
    tryInit();
  }

  // Запускаем, когда DOM готов
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRootObserver);
  } else {
    startRootObserver();
  }

  // Если вдруг контейнер пересоздаётся, но не удаляется (например, обновляется содержимое),
  // наш tryInit сработает, так как мутации будут пойманы.

})();
