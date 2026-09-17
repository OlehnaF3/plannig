// llm.js – адаптер под локальную LLM. По умолчанию недоступна.
(function (global) {
  'use strict';
  var AVAILABLE = false, engine = null;

  function checkAvailability() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL)
      return Promise.resolve(false);
    return fetch(chrome.runtime.getURL('llm/manifest.json'))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { AVAILABLE = !!(j && j.ready); return AVAILABLE; })
      .catch(function () { return false; });
  }

  function load() {
    if (engine) return Promise.resolve(engine);
    if (!AVAILABLE) return Promise.resolve(null);
    return Promise.resolve(null); // сюда встраивается реальный движок
  }

  function predict(features, recentEvents) {
    if (!AVAILABLE) return Promise.resolve(null);
    return load().then(function (e) { return e ? null : null; });
  }

  function snapToValid(n) {
    if (global.PlannigModel && global.PlannigModel.snapToValid)
      return global.PlannigModel.snapToValid(n);
    return Math.max(10, Math.min(990, Math.round(n / 10) * 10));
  }

  global.PlannigLLM = {
    checkAvailability: checkAvailability,
    isAvailable: function () { return AVAILABLE; },
    load: load, predict: predict, snapToValid: snapToValid
  };
})(typeof self !== 'undefined' ? self : window);