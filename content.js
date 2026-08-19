// ======================== КОНФИГ ========================
// Поля: baseUrl, instance, idReport, pickStrategyPolicyId, taskReleasePhases, actions, rabbitQueuePrefix, rabbitQueueSuffix
const API_CONFIG = window.APP_CONFIG;
if (!API_CONFIG) {
  console.warn('Config not loaded');
}

// ======================== ТАБ-КЭШИРОВАНИЕ ========================
// Используем window.TabCache для хранения данных по вкладкам

// Сохранение данных FlexView в кэш текущей вкладки
function cacheFlexView(flexData) {
  try {
    window.TabCache.setItem('flexData', JSON.stringify(flexData));
    console.log(`[TabCache] Сохранены данные FlexView для таба ${window.TabCache.getActiveTabId()}`);
  } catch (e) {
    console.warn('[TabCache] Ошибка сохранения FlexView:', e);
  }
}

// Получение данных FlexView из кэша текущей вкладки
function getCachedFlexView() {
  try {
    const cached = window.TabCache.getItem('flexData');
    if (cached) {
      console.log(`[TabCache] Получены кэшированные данные FlexView для таба ${window.TabCache.getActiveTabId()}`);
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('[TabCache] Ошибка чтения кэша FlexView:', e);
  }
  return null;
}

// Сохранение результатов планирования в кэш текущей вкладки
function cachePlanningResults(result) {
  try {
    window.TabCache.setItem('planningResults', JSON.stringify(result));
    console.log(`[TabCache] Сохранены результаты планирования для таба ${window.TabCache.getActiveTabId()}`);
  } catch (e) {
    console.warn('[TabCache] Ошибка сохранения результатов:', e);
  }
}

// Получение результатов планирования из кэша текущей вкладки
function getCachedPlanningResults() {
  try {
    const cached = window.TabCache.getItem('planningResults');
    if (cached) {
      console.log(`[TabCache] Получены кэшированные результаты планирования для таба ${window.TabCache.getActiveTabId()}`);
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('[TabCache] Ошибка чтения кэша результатов:', e);
  }
  return null;
}

// Очистка кэша текущей вкладки (при удалении вкладки)
function clearCurrentTabCache() {
  try {
    window.TabCache.clearCurrentTab();
    console.log(`[TabCache] Очищен кэш для таба ${window.TabCache.getActiveTabId()}`);
  } catch (e) {
    console.warn('[TabCache] Ошибка очистки кэша:', e);
  }
}

// ======================== ПОПАП ДЛЯ ВВОДА ПРИОРИТЕТА ========================

function showPriorityPopup() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '999999';
    overlay.style.backdropFilter = 'blur(2px)';

    const modal = document.createElement('div');
    modal.style.background = '#fff';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    modal.style.width = '450px';
    modal.style.maxWidth = '90%';
    modal.style.padding = '20px 24px';
    modal.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const title = document.createElement('h4');
    title.textContent = 'Послать в отбор';
    title.style.margin = '0 0 16px 0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = '#2c3e50';
    modal.appendChild(title);

    const fieldContainer = document.createElement('div');
    fieldContainer.style.display = 'flex';
    fieldContainer.style.alignItems = 'center';
    fieldContainer.style.marginBottom = '20px';
    fieldContainer.style.gap = '12px';

    const label = document.createElement('label');
    label.textContent = 'Приоритет';
    label.style.fontWeight = '600';
    label.style.color = '#34495e';
    label.style.fontSize = '14px';
    label.style.minWidth = '80px';
    fieldContainer.appendChild(label);

    const inputWrapper = document.createElement('div');
    inputWrapper.style.flex = '1';

    const input = document.createElement('input');
    input.type = 'number';
    input.placeholder = 'Введите число или оставьте пустым';
    input.style.width = '100%';
    input.style.padding = '8px 12px';
    input.style.fontSize = '14px';
    input.style.border = '1px solid #dce1e8';
    input.style.borderRadius = '4px';
    input.style.boxSizing = 'border-box';
    input.style.transition = 'border-color 0.2s';
    input.value = '';
    inputWrapper.appendChild(input);
    fieldContainer.appendChild(inputWrapper);
    modal.appendChild(fieldContainer);

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.gap = '10px';
    btnContainer.style.marginTop = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.style.padding = '8px 20px';
    cancelBtn.style.border = '1px solid #dce1e8';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.color = '#7f8c8d';
    cancelBtn.style.fontSize = '14px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.transition = 'background 0.2s';
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#f5f7fa';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
    });
    cancelBtn.addEventListener('click', () => {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve('cancel');
    });

    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.padding = '8px 20px';
    okBtn.style.border = 'none';
    okBtn.style.borderRadius = '4px';
    okBtn.style.background = '#e74c3c';
    okBtn.style.color = '#fff';
    okBtn.style.fontSize = '14px';
    okBtn.style.fontWeight = '600';
    okBtn.style.cursor = 'pointer';
    okBtn.style.transition = 'background 0.2s';
    okBtn.addEventListener('mouseenter', () => {
      okBtn.style.background = '#c0392b';
    });
    okBtn.addEventListener('mouseleave', () => {
      okBtn.style.background = '#e74c3c';
    });
    okBtn.addEventListener('click', () => {
      const val = input.value.trim();
      if (val === '') {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(null);
        return;
      }
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        alert('Введите корректное положительное число');
        return;
      }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(num);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        okBtn.click();
      }
    });

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(okBtn);
    modal.appendChild(btnContainer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => input.focus(), 100);
  });
}

// ======================== ОСНОВНАЯ ЛОГИКА ========================

async function executeFlow(rebuild = true, priority = null, strategyId = '1') {
  const token = Utils.getToken();
  if (!token) throw new Error('Токен не найден');
  console.log('🚀 Начинаем выполнение...');

  console.log('⏳ 1/4 Получение ID...');
  let flexData;
  // Пытаемся получить из кэша вкладки, если не нашли — запрашиваем с сервера
  const cachedFlex = getCachedFlexView();
  if (cachedFlex) {
    flexData = cachedFlex;
    console.log(`[TabCache] Использованы кэшированные данные для таба ${window.TabCache.getActiveTabId()}`);
  } else {
    flexData = await Utils.fetchFlexView(token, API_CONFIG.baseUrl);
    cacheFlexView(flexData);
  }
  const flexIds = flexData.map(item => ({ id: String(item[0]), priority: String(item[1]) }));
  console.log(`✅ FlexView: получено ${flexIds.length} записей`);
  
  let domIds = [];
  if (!rebuild) {
    // Пытаемся получить из кэша вкладки, если не нашли — запрашиваем
    const cachedDomIds = window.TabCache.getItem('domIds');
    if (cachedDomIds) {
      domIds = JSON.parse(cachedDomIds);
      console.log(`[TabCache] Использованы кэшированные DOM ID для таба ${window.TabCache.getActiveTabId()}`);
    } else {
      const idFormDOMS = await Utils.getIdsFromDOM();
      domIds = idFormDOMS.map(item => ({ id: String(item.id), priority: String(item.priority || '0') }));
      try {
        window.TabCache.setItem('domIds', JSON.stringify(domIds));
        console.log(`[TabCache] Сохранены DOM ID для таба ${window.TabCache.getActiveTabId()}`);
      } catch (e) {
        console.warn('[TabCache] Ошибка сохранения DOM ID:', e);
      }
    }
    console.log(`📌 DOM: получено ${domIds.length} записей`);
  }

  // Строим карту эффективных приоритетов
  const effectivePriority = new Map();
  const domIdSet = new Set(domIds.map(d => d.id));

  // Добавляем все ID из FlexView, которых нет в DOM
  for (const { id, priority: flexPrio } of flexIds) {
    if (!domIdSet.has(id)) {
      effectivePriority.set(id, parseInt(flexPrio, 10));
    }
  }

  // Добавляем ID из DOM с их приоритетом (переопределённым, если задан)
  for (const { id, priority: domPrio } of domIds) {
    const effPrio = (priority !== null && priority !== undefined) ? priority : parseInt(domPrio, 10);
    effectivePriority.set(id, effPrio);
  }

  // Группировка по приоритету
  const grouped = {};
  for (const [id, prio] of effectivePriority.entries()) {
    if (!grouped[prio]) grouped[prio] = [];
    grouped[prio].push(id);
  }

  // Вывод статистики
  const sortedKeys = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
  console.log('📊 Группировка всех ID по приоритету:');
  for (const p of sortedKeys) {
    console.log(`  Приоритет ${p}: ${grouped[p].length} ID`);
  }

	if(flexIds.length>0)
	{	 
	  console.log('⏳ 2/4 Скачивание отчёта...');
	  await Utils.performDownloadReport(token, API_CONFIG.baseUrl, API_CONFIG.idReport);

	  console.log('⏳ 3/4 Очистка очереди...');
	  await Utils.performPurgeQueue(token, API_CONFIG.baseUrl, API_CONFIG);
	}
	else
	{
		console.log('⏳ Пропускаем 2,3 ступень, т.к пустая очередь');
	}
  console.log('⏳ 4/4 Отправка задач...');
  const planningResult = await Utils.sendPlanning(token, API_CONFIG.baseUrl, API_CONFIG, grouped, strategyId);

  console.log('✅ Все задачи успешно запланированы!');
  
  // Сохраняем результаты планирования в кэш вкладки
  const resultData = {
    timestamp: new Date().toISOString(),
    tabId: window.TabCache.getActiveTabId(),
    grouped: grouped,
    strategyId: strategyId,
    success: true
  };
  cachePlanningResults(resultData);
  
  return true;
}

async function executeResetFlow() {
  const token = Utils.getToken();
  if (!token) throw new Error('Токен не найден');
  console.log('🚀 Сброс планирования...');
  await Utils.performDownloadReport(token, API_CONFIG.baseUrl, API_CONFIG.idReport);
  await Utils.performPurgeQueue(token, API_CONFIG.baseUrl, API_CONFIG);
  console.log('✅ Сброс планирования завершён!');
  return true;
}

// ======================== СТИЛИЗОВАННЫЕ ПОПАПЫ (из второй версии) ========================

function injectPopupStyles() {
  if (document.getElementById('popup-styles')) return;
  const style = document.createElement('style');
  style.id = 'popup-styles';
  style.textContent = `
    .popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--p-mask-background, rgba(0,0,0,0.4));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      backdrop-filter: blur(2px);
    }
    .popup-modal {
      background: var(--p-overlay-modal-background, #fff);
      border-radius: var(--p-overlay-modal-border-radius, 0.75rem);
      box-shadow: var(--p-overlay-modal-shadow, 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1));
      padding: var(--p-overlay-modal-padding, 1.25rem);
      max-width: 90%;
      max-height: 90%;
      overflow: auto;
      min-width: 300px;
      color: var(--p-text-color, #212529);
      font-family: var(--bs-font-sans-serif);
      font-size: var(--bs-body-font-size);
      line-height: var(--bs-body-line-height);
    }
    .popup-btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: var(--p-button-border-radius, 0.375rem);
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .popup-btn-confirm {
      background: var(--p-button-primary-background, #0d6efd);
      color: var(--p-button-primary-color, #fff);
    }
    .popup-btn-confirm:hover {
      background: var(--p-button-primary-hover-background, #0b5ed7);
    }
    .popup-btn-cancel {
      background: var(--p-button-secondary-background, #e9ecef);
      color: var(--p-button-secondary-color, #212529);
    }
    .popup-btn-cancel:hover {
      background: var(--p-button-secondary-hover-background, #d3d7db);
    }
    .popup-btn-close {
      background: var(--p-button-primary-background, #0d6efd);
      color: var(--p-button-primary-color, #fff);
    }
    .popup-btn-close:hover {
      background: var(--p-button-primary-hover-background, #0b5ed7);
    }
    @keyframes popup-spin {
      to { transform: rotate(360deg); }
    }
    .popup-spinner {
      width: 2rem;
      height: 2rem;
      border: 3px solid var(--p-surface-200, #e2e8f0);
      border-top-color: var(--p-primary-color, #10b981);
      border-radius: 50%;
      animation: popup-spin 1s linear infinite;
      margin-bottom: 1rem;
    }
  `;
  const head = document.head || document.querySelector('head');
  if (head) {
    head.appendChild(style);
  } else {
    document.documentElement.appendChild(style);
  }
}

//Получение попап общее 
function createPopupBase() {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  const modal = document.createElement('div');
  modal.className = 'popup-modal';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return { overlay, modal };
}

//Закрытие попап общее 
function closePopup(overlay) {
  if (overlay && overlay.parentNode) overlay.remove();
}

//Получение подтверждение от попап 
function showConfirmPopup(message) {
  return new Promise((resolve, reject) => {
    const { overlay, modal } = createPopupBase();
    modal.innerHTML = `
      <h3 style="margin-top:0; margin-bottom:1rem;">Подтверждение</h3>
      <p>${message}</p>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
        <button class="popup-btn popup-btn-cancel">Отмена</button>
        <button class="popup-btn popup-btn-confirm">ОК</button>
      </div>
    `;
    const confirmBtn = modal.querySelector('.popup-btn-confirm');
    const cancelBtn = modal.querySelector('.popup-btn-cancel');
    const cleanup = () => closePopup(overlay);
    confirmBtn.onclick = () => { cleanup(); resolve(); };
    cancelBtn.onclick = () => { cleanup(); reject('cancel'); };
  });
}

//Попап прогресса 
function showProgressPopup(message) {
  const { overlay, modal } = createPopupBase();
  modal.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; padding:1rem 0;">
      <div class="popup-spinner"></div>
      <p>${message}</p>
    </div>
  `;
  return {
    update: (newMessage, isSuccess) => {
      modal.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; padding:1rem 0;">
          <div style="font-size:2rem; margin-bottom:1rem;">${isSuccess ? '✅' : '❌'}</div>
          <p>${newMessage}</p>
          <button class="popup-btn popup-btn-close" style="margin-top:1.5rem;">Закрыть</button>
        </div>
      `;
      modal.querySelector('.popup-btn-close').onclick = () => closePopup(overlay);
    },
    close: () => closePopup(overlay)
  };
}

//Попап результата
function showResultPopup(message, isSuccess) {
  const { overlay, modal } = createPopupBase();
  modal.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; padding:1rem 0;">
      <div style="font-size:2rem; margin-bottom:1rem;">${isSuccess ? '✅' : '❌'}</div>
      <p>${message}</p>
      <button class="popup-btn popup-btn-close" style="margin-top:1.5rem;">Закрыть</button>
    </div>
  `;
  modal.querySelector('.popup-btn-close').onclick = () => closePopup(overlay);
}

//Попап выбора стратегии отбора 
function showStrategyPopup() {
  return new Promise((resolve, reject) => {
    const { overlay, modal } = createPopupBase();
    modal.innerHTML = `
      <h3 style="margin-top:0; margin-bottom:1rem;">Выберите стратегию</h3>
      <div style="margin-bottom: 1.5rem;">
        <label style="display:block; margin-bottom:0.5rem;">
          <input type="radio" name="strategy" value="1" > Стандарт
        </label>
        <label style="display:block;">
          <input type="radio" name="strategy" value="2" checked> Упрощенный
        </label>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <button class="popup-btn popup-btn-cancel">Отмена</button>
        <button class="popup-btn popup-btn-confirm">ОК</button>
      </div>
    `;
    const confirmBtn = modal.querySelector('.popup-btn-confirm');
    const cancelBtn = modal.querySelector('.popup-btn-cancel');
    const cleanup = () => closePopup(overlay);
    confirmBtn.onclick = () => {
      const selected = modal.querySelector('input[name="strategy"]:checked');
      resolve(selected ? selected.value : '1');
      cleanup();
    };
    cancelBtn.onclick = () => {
      cleanup();
      reject('cancel');
    };
  });
}

// ======================== ДОБАВЛЕНИЕ КНОПОК ========================

function addButtonsToFooter() {
  const container = document.querySelector('.screen-buttons-container');
  if (!container) return false;

  // Проверяем наличие наших кнопок, чтобы не дублировать
  if (container.querySelector('[data-custom-rebuild]') &&
      container.querySelector('[data-custom-reset]') &&
      container.querySelector('[data-custom-send]')) return true;

  const template = container.querySelector('p-button.screen-btn');
  if (!template) return false;

  const allButtons = container.querySelectorAll('p-button.screen-btn');
  let returnBtn = null;
  for (const btn of allButtons) {
    const lbl = btn.querySelector('.p-button-label');
    if (lbl && lbl.textContent.trim() === 'Назначить') { //тут можно менять около какой кнопки будут новые 
      returnBtn = btn;
      break;
    }
  }

  function createCustomButton(label, dataAttr, clickHandler) {
    const btn = template.cloneNode(true);
    btn.setAttribute(`data-custom-${dataAttr}`, 'true');
    const labelEl = btn.querySelector('.p-button-label');
    if (labelEl) labelEl.textContent = label;
    const buttonEl = btn.querySelector('button');
    if (buttonEl) buttonEl.addEventListener('click', clickHandler);
    return btn;
  }

  // Кнопка "Отправить в отбор" (с попапом приоритета)
  if (!container.querySelector('[data-custom-send]')) {
    const btnSend = createCustomButton('Отправить в отбор', 'send', async () => {
      const priority = await showPriorityPopup();
      if (priority === 'cancel') return;
      let progress = null;
      try {
        progress = showProgressPopup('Отправка выбранных строк в отбор...');
        await executeFlow(false, priority, API_CONFIG.pickStrategyPolicyId.standard);
        progress.update('✅ Отправка успешно завершена!', true);
      } catch (err) {
        if (progress) progress.update('❌ Ошибка: ' + err.message, false);
        else showResultPopup('❌ Ошибка: ' + err.message, false);
      }
    });
    if (returnBtn) container.insertBefore(btnSend, returnBtn);
    else container.appendChild(btnSend);
  }

  // Кнопка "Перестроить приоритеты"
  if (!container.querySelector('[data-custom-rebuild]')) {
    const btnRebuild = createCustomButton('Перестроить приоритеты', 'rebuild', async () => {
      let progress = null;
      try {
        const strategy = await showStrategyPopup();
        await showConfirmPopup('Вы уверены, что хотите перестроить приоритеты?');
        progress = showProgressPopup('Выполняется перестроение приоритетов...');
        await executeFlow(true, null, strategy);
        progress.update('✅ Перестроение успешно завершено!', true);
      } catch (err) {
        if (err === 'cancel') return;
        if (progress) progress.update('❌ Ошибка: ' + err.message, false);
        else showResultPopup('❌ Ошибка: ' + err.message, false);
      }
    });
    if (returnBtn) container.insertBefore(btnRebuild, returnBtn);
    else container.appendChild(btnRebuild);
  }

  // Кнопка "Сбросить планирование"
  if (!container.querySelector('[data-custom-reset]')) {
    const btnReset = createCustomButton('Сбросить планирование', 'reset', async () => {
      let progress = null;
      try {
        await showConfirmPopup('Вы уверены, что хотите сбросить планирование?');
        progress = showProgressPopup('Выполняется сброс планирования...');
        await executeResetFlow();
        progress.update('✅ Сброс планирования успешно завершён!', true);
      } catch (err) {
        if (err === 'cancel') return;
        if (progress) progress.update('❌ Ошибка: ' + err.message, false);
        else showResultPopup('❌ Ошибка: ' + err.message, false);
      }
    });
    const rebuildBtn = container.querySelector('[data-custom-rebuild]');
    if (rebuildBtn && returnBtn) container.insertBefore(btnReset, returnBtn);
    else if (returnBtn) container.insertBefore(btnReset, returnBtn);
    else container.appendChild(btnReset);
  }

  console.log('✅ Все кнопки добавлены');
  return true;
}

// ======================== ИНИЦИАЛИЗАЦИЯ ========================

injectPopupStyles();

function setupObserver() {
  addButtonsToFooter();
  const observer = new MutationObserver(() => {
    const container = document.querySelector('.screen-buttons-container');
    if (container && container.querySelector('p-button.screen-btn')) addButtonsToFooter();
  });
  observer.observe(document, { childList: true, subtree: true });
}

setupObserver();

// ======================== ОБРАБОТЧИКИ СООБЩЕНИЙ ========================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    sendResponse({ token: Utils.getToken() });
    return true;
  }
  if (request.action === 'getIdsFromDOM') {
    const result = Utils.getIdsFromDOM();
    sendResponse(result);
    return true;
  }
  if (request.action === 'getTabIndex') {
    const tabIndex = window.TabCache ? window.TabCache.getActiveTabId() : null;
    sendResponse({ tabIndex: tabIndex });
    return true;
  }
  if (request.action === 'getLog') {
    const tabIndex = request.tabIndex !== undefined ? request.tabIndex : 
                     (window.TabCache ? window.TabCache.getActiveTabId() : null);
    chrome.runtime.sendMessage({ action: 'getLog', tabIndex: tabIndex }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[TabCache] Ошибка получения лога:', chrome.runtime.lastError);
        sendResponse({ ids: [], pairs: {} });
        return;
      }
      const log = response?.log || [];
      const result = Utils.parseLogToPairs(log);
      sendResponse(result);
    });
    return true;
  }
});

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
  this.remove(); // удаляем после загрузки, чтобы не оставался в DOM
};
document.documentElement.prepend(script);

// Слушаем сообщения от inject.js и пересылаем в background с указанием tabIndex
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type === 'AJAX_RESPONSE') {
    const tabIndex = window.TabCache ? window.TabCache.getActiveTabId() : null;
    chrome.runtime.sendMessage({
      type: 'response',
      tabIndex: tabIndex,
      ...event.data.payload
    });
  }
});