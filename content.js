// ======================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ========================

//Получения конфига 
//Поля baseUrl, instance, idReport
 const API_CONFIG = window.APP_CONFIG;
  if (!API_CONFIG) {
   console.warn('Config not loaded');
  }
  
// Получение токена 
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

// Синхронное получение ID из DOM 
function getIdsFromDOM() {
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
      document.body.removeChild(overlay);
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
        document.body.removeChild(overlay);
        resolve(null);
        return;
      }
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        alert('Введите корректное положительное число');
        return;
      }
      document.body.removeChild(overlay);
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

// ======================== ОСНОВНЫЕ ЗАПРОСЫ ========================

//Получение данных, для перепланировки 
//Получаем айди расходов и приоритеты планирования 
async function fetchFlexView(token) {
  console.log('🌐 Загружаю свежие данные FlexView...');
  const url = `http://${API_CONFIG.baseUrl}:8080/api/data/flexView/so.SO_H`;
  const body = JSON.stringify({
    filterValues: {
      'soh.complete': 'false', //Завершено нет
      'soh.wave.planning': 'true' //Планируется да 
    },
    columns: ['soh.id', 'soh.wave.pickPriority'] //Берем 2 поля
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

//Чистка очереди в скуле, вызов отчета, который дергает процедуру 
async function performDownloadReport(token) {
  const url = `http://${API_CONFIG.baseUrl}:8080/api/report/download`;
  const body = JSON.stringify({
	  reportDefinitionId: API_CONFIG.idReport,
	  format: 'PDF',
	  params: {} });
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
  console.log(`✅ Отчёт "${filename}" скачан (${blob.size} байт)`);
}

//Чистка очереди rabbitmq
async function performPurgeQueue(token) {
  const url = `http://${API_CONFIG.baseUrl}:8080/actuator/hawtio/console/jolokia/?maxDepth=7&maxCollectionSize=50000&ignoreErrors=true&canonicalNaming=false`;
  const body = JSON.stringify({
    type: 'exec',
    mbean: 'org.springframework.amqp.rabbit.core:name=getRabbitAdmin,type=RabbitAdmin',
    operation: 'purgeQueue(java.lang.String)',
    arguments: [`FARMLEND-${API_CONFIG.instance}-V7-ALLOC-1-0-ALLOCATE`]
  });
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body
  });
  if (!resp.ok) throw new Error(`Purge queue HTTP ${resp.status}`);
  const json = await resp.json();
  console.log('✅ Очередь очищена:', json);
}

//Отправка в отбор 
async function sendPlanning(token, grouped, strategyId) {
  const url = `http://${API_CONFIG.baseUrl}:8080/api/so/SOService/createTasks`;
  const sortedPriorities = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
  for (const p of sortedPriorities) {
    const ids = grouped[p];
    console.log(`📌 Приоритет ${p}: отправка ${ids.length} ID...`);
    const requestBody = {
      ids: ids,
      pickStrategyPolicyId: strategyId || '1',
      taskReleasePhases: ['1', '8'],
      actions: 7,
      priority: parseInt(p, 10) // всегда передаём приоритет для группы
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

// ======================== ОСНОВНАЯ ЛОГИКА ========================

async function executeFlow(rebuild = true, priority = null, strategyId = '1') {
  const token = getToken();
  if (!token) throw new Error('Токен не найден');
  console.log('🚀 Начинаем выполнение...');

  console.log('⏳ 1/4 Получение ID...');
  const flexData = await fetchFlexView(token);
  const flexIds = flexData.map(item => ({ id: String(item[0]), priority: String(item[1]) }));
  console.log(`✅ FlexView: получено ${flexIds.length} записей`);
  
  let domIds = [];
  if (!rebuild) {
    const { ids, pairs } = getIdsFromDOM();
    domIds = ids.map(id => ({ id: String(id), priority: String(pairs[id] || '0') }));
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
	  await performDownloadReport(token);

	  console.log('⏳ 3/4 Очистка очереди...');
	  await performPurgeQueue(token);
	}
	else
	{
		console.log('⏳ Пропускаем 2,3 ступень, т.к пустая очередь');
	}
  console.log('⏳ 4/4 Отправка задач...');
  await sendPlanning(token, grouped, strategyId);

  console.log('✅ Все задачи успешно запланированы!');
  return true;
}

async function executeResetFlow() {
  const token = getToken();
  if (!token) throw new Error('Токен не найден');
  console.log('🚀 Сброс планирования...');
  await performDownloadReport(token);
  await performPurgeQueue(token);
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
        await executeFlow(false, priority, '1'); // стратегия по умолчанию, можно не менять
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
    sendResponse({ token: getToken() });
    return true;
  }
  if (request.action === 'getIdsFromDOM') {
    const result = getIdsFromDOM();
    sendResponse(result);
    return true;
  }
});