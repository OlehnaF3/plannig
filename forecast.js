// forecast.js – статистика и признаки. Работает в SW, popup, content.
(function (global) {
  'use strict';

  var KEY = 'forecast_history_v1';
  var MAX_RECORDS = 20000;
  var HOUR_MS = 60 * 60 * 1000;
  var DAY_MS = 24 * HOUR_MS;

  function getHistory() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(KEY, function (data) {
        if (chrome.runtime.lastError) return resolve([]);
        resolve(data && data[KEY] ? data[KEY] : []);
      });
    });
  }

  function appendEvent(event) {
    return getHistory().then(function (history) {
      history.push(Object.assign({}, event, { recordedAt: Date.now() }));
      var trimmed = history.length > MAX_RECORDS
        ? history.slice(history.length - MAX_RECORDS) : history;
      return new Promise(function (resolve) {
        var o = {}; o[KEY] = trimmed;
        chrome.storage.local.set(o, function () { resolve(trimmed); });
      });
    });
  }

  function clearHistory() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(KEY, function () { resolve(); });
    });
  }

  function avg(a) { if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function med(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function std(a) {
    if (a.length < 2) return 0;
    var m = avg(a), acc = 0;
    for (var i = 0; i < a.length; i++) acc += Math.pow(a[i] - m, 2);
    return Math.sqrt(acc / a.length);
  }

  function extractFeatures(history, now) {
    now = now || Date.now();
    var d = new Date(now);
    var lastHour = history.filter(function (e) { return now - e.recordedAt < HOUR_MS; });
    var same7d = history.filter(function (e) {
      var dt = new Date(e.recordedAt);
      var age = now - e.recordedAt;
      return Math.abs(dt.getHours() - d.getHours()) < 1 && age < 7 * DAY_MS && age > DAY_MS;
    });
    function pick(arr, t, f) {
      return arr.filter(function (e) { return e.type === t && e[f] != null; }).map(function (e) { return e[f]; });
    }
    return {
      hourOfDay: d.getHours(),
      dayOfWeek: d.getDay(),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      recentOrders: lastHour.filter(function (e) { return e.type === 'order_added'; }).length,
      recentWaves: lastHour.filter(function (e) { return e.type === 'wave_created'; }).length,
      lastHourAvgPriority: avg(pick(lastHour, 'priority_set', 'priority')),
      lastHourMedianPriority: med(pick(lastHour, 'priority_set', 'priority')),
      lastHourPriorityStd: std(pick(lastHour, 'priority_set', 'priority')),
      lastHourAvgWaveSize: avg(pick(lastHour, 'wave_created', 'size')),
      sameHourHistoricalAvgPriority: avg(pick(same7d, 'priority_set', 'priority'))
    };
  }

  function featuresToVector(f) {
    return [
      Math.sin(2 * Math.PI * f.hourOfDay / 24),
      Math.cos(2 * Math.PI * f.hourOfDay / 24),
      f.dayOfWeek / 6,
      f.isWeekend ? 1 : 0,
      Math.min(f.recentOrders / 50, 1),
      Math.min(f.recentWaves / 20, 1),
      (f.lastHourAvgPriority - 500) / 490,
      (f.lastHourMedianPriority - 500) / 490,
      Math.min(f.lastHourPriorityStd / 200, 1),
      Math.min(f.lastHourAvgWaveSize / 100, 1),
      (f.sameHourHistoricalAvgPriority - 500) / 490,
      1
    ];
  }

  function baselinePriority(features, history) {
    var now = Date.now();
    var ev = history.filter(function (e) { return e.type === 'priority_set' && e.priority != null; }).slice(-200);
    if (!ev.length) return null;
    var HL = 6 * HOUR_MS, wsum = 0, wt = 0, i;
    for (i = 0; i < ev.length; i++) {
      var w = Math.pow(0.5, (now - ev[i].recordedAt) / HL);
      wt += ev[i].priority * w;
      wsum += w;
    }
    var fresh = wsum > 0 ? wt / wsum : 0;
    var hourShift = features.sameHourHistoricalAvgPriority
      ? (features.sameHourHistoricalAvgPriority - fresh) * 0.5 : 0;
    var load = Math.min(features.recentOrders / 10, 20);
    var raw = fresh + hourShift + load;
    return Math.max(10, Math.min(990, Math.round(raw / 10) * 10));
  }

  function baselineWaveSize(history) {
    var now = Date.now();
    var waves = history.filter(function (e) { return e.type === 'wave_created' && e.size != null; }).slice(-100);
    if (!waves.length) return null;
    var HL = 4 * HOUR_MS, wsum = 0, wt = 0, i;
    for (i = 0; i < waves.length; i++) {
      var w = Math.pow(0.5, (now - waves[i].recordedAt) / HL);
      wt += waves[i].size * w;
      wsum += w;
    }
    return Math.max(1, Math.round(wt / wsum));
  }

  function predictBaseline() {
    return getHistory().then(function (h) {
      var f = extractFeatures(h);
      var p = baselinePriority(f, h);
      var ws = baselineWaveSize(h);
      var samples = h.filter(function (e) { return e.type === 'priority_set'; }).length;
      var confidence = samples >= 500 ? 'high' : samples >= 100 ? 'medium' : 'low';
      var reason = p == null
        ? 'Недостаточно данных.'
        : 'На основе ' + samples + ' действий. За час: ' + f.recentOrders + ' заказов, ' + f.recentWaves + ' волн.';
      return { priority: p, waveSize: ws, confidence: confidence, reason: reason, samples: samples, features: f };
    });
  }

  function track(type, payload) {
    return appendEvent(Object.assign({ type: type }, payload || {}));
  }
  function feedback(predicted, actual) {
    return track('forecast_feedback', { predicted: predicted, actual: actual, delta: actual - predicted });
  }

  global.PlannigForecast = {
    track: track,
    predictBaseline: predictBaseline,
    feedback: feedback,
    getHistory: getHistory,
    clearHistory: clearHistory,
    _extractFeatures: extractFeatures,
    _featuresToVector: featuresToVector
  };
})(typeof self !== 'undefined' ? self : window);