// inject.js – выполняется в контексте страницы
// Отвечает ТОЛЬКО за перехват fetch и XMLHttpRequest

(function() {
  'use strict';

  // Вспомогательная функция для извлечения данных из тела запроса
  function parseRequestBody(body) {
    if (typeof body !== 'string' || !body) return null;
    try {
      const parsed = JSON.parse(body);
      return {
        columns: parsed.columns || null,
        pageSize: parsed.pageSize || null,
        // Добавляем другие полезные данные из запроса
        query: parsed.query || null,
        filters: parsed.filters || null
      };
    } catch (e) {
      return null;
    }
  }

  // Отправка данных в content script
  function sendToContentScript(payload) {
    window.postMessage({
      type: 'AJAX_RESPONSE',
      payload: payload
    }, '*');
  }

  // ---- Перехват fetch API ----
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    let requestInfo = null;

    // Парсим тело запроса для POST-запросов
    if (options.method === 'POST' && options.body) {
      requestInfo = parseRequestBody(options.body);
    }

    // Вызываем оригинальный fetch
    return originalFetch.apply(this, args).then(async (response) => {
      try {
        // Клонируем ответ для чтения
        const clone = response.clone();
        let responseBody = '';
        
        try {
          responseBody = await clone.text();
        } catch (e) {
          responseBody = '[Не удалось прочитать тело ответа]';
        }

        // Отправляем данные в content script
        sendToContentScript({
          url: response.url || url,
          status: response.status,
          statusText: response.statusText,
          method: options.method || 'GET',
          responseBody: responseBody,
          timestamp: new Date().toISOString(),
          requestInfo: requestInfo
        });
      } catch (e) {
        console.warn('[Inject] Ошибка при обработке fetch response:', e);
      }
      
      // Возвращаем оригинальный ответ
      return response;
    });
  };

  // ---- Перехват XMLHttpRequest ----
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    // Сохраняем информацию о запросе
    this._interceptMethod = method;
    this._interceptUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    // Сохраняем информацию из тела запроса
    this._interceptRequestInfo = parseRequestBody(body);

    // Добавляем обработчик загрузки
    this.addEventListener('load', function() {
      try {
        let responseBody = '';
        try {
          responseBody = this.responseText || '[Пустой ответ]';
        } catch (e) {
          responseBody = '[Не удалось прочитать тело ответа]';
        }

        // Отправляем данные в content script
        sendToContentScript({
          url: this._interceptUrl,
          status: this.status,
          statusText: this.statusText,
          method: this._interceptMethod,
          responseBody: responseBody,
          timestamp: new Date().toISOString(),
          requestInfo: this._interceptRequestInfo
        });
      } catch (e) {
        console.warn('[Inject] Ошибка при обработке XHR response:', e);
      }
    });

    // Вызываем оригинальный send
    return originalXHRSend.apply(this, [body]);
  };

  console.log('[Inject] Перехват сетевых запросов активирован');
})();