// inject.js – выполняется на странице

(function() {
  // Вспомогательная функция для извлечения columns и pageSize из тела запроса
  function parseRequest(body) {
    if (typeof body !== 'string') return null;
    try {
      const parsed = JSON.parse(body);
      return {
        columns: parsed.columns || null,
        pageSize: parsed.pageSize || null
      };
    } catch (e) {
      return null;
    }
  }

  // ---- Перехват fetch ----
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const options = args[1] || {};
    let requestInfo = null;

    if (options.method === 'POST' && options.body) {
      const parsed = parseRequest(options.body);
      if (parsed) {
        requestInfo = parsed;
      }
    }

    return originalFetch.apply(this, args).then(async (response) => {
      const clone = response.clone();
      let body = '';
      try {
        body = await clone.text();
      } catch (e) {
        body = '[Не удалось прочитать тело]';
      }
      window.postMessage({
        type: 'AJAX_RESPONSE',
        payload: {
          url: response.url,
          status: response.status,
          method: options.method || 'GET',
          responseBody: body,
          timestamp: new Date().toISOString(),
          columns: requestInfo?.columns || null,
          pageSize: requestInfo?.pageSize || null
        }
      }, '*');
      return response;
    });
  };

  // ---- Перехват XMLHttpRequest ----
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._method = method;
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    let requestInfo = null;
    if (body && typeof body === 'string') {
      const parsed = parseRequest(body);
      if (parsed) {
        requestInfo = parsed;
      }
    }
    this._requestInfo = requestInfo;

    this.addEventListener('load', function() {
      let responseBody = '';
      try {
        responseBody = this.responseText;
      } catch (e) {
        responseBody = '[Не удалось прочитать тело]';
      }
      window.postMessage({
        type: 'AJAX_RESPONSE',
        payload: {
          url: this._url,
          status: this.status,
          method: this._method,
          responseBody: responseBody,
          timestamp: new Date().toISOString(),
          columns: this._requestInfo?.columns || null,
          pageSize: this._requestInfo?.pageSize || null
        }
      }, '*');
    });
    return originalXHRSend.apply(this, [body]);
  };
})();