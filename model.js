// model.js – MLP 12→32→16→1 (sigmoid). Регрессия 10..990.
(function (global) {
  'use strict';

  var N_IN = 12, N_H1 = 32, N_H2 = 16, N_OUT = 1;
  var P_MIN = 10, P_MAX = 990, P_STEP = 10, P_RANGE = P_MAX - P_MIN;
  var VALID = (function () { var a = []; for (var p = P_MIN; p <= P_MAX; p += P_STEP) a.push(p); return a; })();

  function z1(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; }
  function z2(r, c) { var a = new Array(r); for (var i = 0; i < r; i++) a[i] = z1(c); return a; }
  function relu(x) { return x > 0 ? x : 0; }
  function sig(x) { if (x >= 0) { var z = Math.exp(-x); return 1 / (1 + z); } var z2 = Math.exp(x); return z2 / (1 + z2); }
  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function initRandom() {
    var W1 = z2(N_IN, N_H1), b1 = z1(N_H1);
    var W2 = z2(N_H1, N_H2), b2 = z1(N_H2);
    var W3 = z2(N_H2, N_OUT), b3 = z1(N_OUT);
    var i, j;
    var s1 = Math.sqrt(2 / N_IN), s2 = Math.sqrt(2 / N_H1), s3 = Math.sqrt(2 / N_H2);
    for (i = 0; i < N_IN; i++) for (j = 0; j < N_H1; j++) W1[i][j] = gauss() * s1;
    for (i = 0; i < N_H1; i++) for (j = 0; j < N_H2; j++) W2[i][j] = gauss() * s2;
    for (i = 0; i < N_H2; i++) for (j = 0; j < N_OUT; j++) W3[i][j] = gauss() * s3;
    return { W1: W1, b1: b1, W2: W2, b2: b2, W3: W3, b3: b3,
             meta: { trained: false, samples: 0, version: 1 } };
  }

  var DEFAULT = {
    W1: z2(N_IN, N_H1), b1: z1(N_H1), W2: z2(N_H1, N_H2), b2: z1(N_H2),
    W3: z2(N_H2, N_OUT), b3: z1(N_OUT),
    meta: { trained: false, samples: 0, version: 1 }
  };

  function pToT(p) { return (p - P_MIN) / P_RANGE; }
  function snap(raw) {
    var lo = 0, hi = VALID.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (VALID[mid] < raw) lo = mid + 1; else hi = mid; }
    if (lo > 0 && Math.abs(VALID[lo - 1] - raw) < Math.abs(VALID[lo] - raw)) lo--;
    return VALID[lo];
  }
  function tToP(t) { return snap(t * P_RANGE + P_MIN); }
  function pIdx(p) { for (var i = 0; i < VALID.length; i++) if (VALID[i] === p) return i; return -1; }

  function forward(x, m) {
    var h1p = new Array(N_H1), h1 = new Array(N_H1);
    var h2p = new Array(N_H2), h2 = new Array(N_H2);
    var i, j, s;
    for (j = 0; j < N_H1; j++) { s = m.b1[j]; for (i = 0; i < N_IN; i++) s += x[i] * m.W1[i][j]; h1p[j] = s; h1[j] = relu(s); }
    for (j = 0; j < N_H2; j++) { s = m.b2[j]; for (i = 0; i < N_H1; i++) s += h1[i] * m.W2[i][j]; h2p[j] = s; h2[j] = relu(s); }
    s = m.b3[0]; for (i = 0; i < N_H2; i++) s += h2[i] * m.W3[i][0];
    var y = sig(s);
    return { y: y, priority: tToP(y), confidence: Math.min(1, Math.abs(y - 0.5) * 2 + 0.3),
             hidden: { h1p: h1p, h1: h1, h2p: h2p, h2: h2 } };
  }

  function step(x, target, m, lr, w) {
    w = w == null ? 1 : w;
    var f = forward(x, m);
    var y = f.y;
    var dL = 2 * (y - target) * y * (1 - y) * w;
    var i, j;
    var dH2 = z1(N_H2);
    for (i = 0; i < N_H2; i++) { dH2[i] = m.W3[i][0] * dL; m.W3[i][0] -= lr * f.hidden.h2[i] * dL; }
    m.b3[0] -= lr * dL;
    for (i = 0; i < N_H2; i++) if (f.hidden.h2p[i] <= 0) dH2[i] = 0;
    var dH1 = z1(N_H1);
    for (j = 0; j < N_H2; j++) {
      for (i = 0; i < N_H1; i++) { dH1[i] += m.W2[i][j] * dH2[j]; m.W2[i][j] -= lr * f.hidden.h1[i] * dH2[j]; }
      m.b2[j] -= lr * dH2[j];
    }
    for (i = 0; i < N_H1; i++) if (f.hidden.h1p[i] <= 0) dH1[i] = 0;
    for (j = 0; j < N_H1; j++) {
      for (i = 0; i < N_IN; i++) m.W1[i][j] -= lr * x[i] * dH1[j];
      m.b1[j] -= lr * dH1[j];
    }
    return (y - target) * (y - target);
  }

  var KEY = 'forecast_model_v2';
  function loadModel() {
    return new Promise(function (res) {
      chrome.storage.local.get(KEY, function (d) {
        if (chrome.runtime.lastError) return res(DEFAULT);
        res(d && d[KEY] ? d[KEY] : DEFAULT);
      });
    });
  }
  function saveModel(m) {
    return new Promise(function (res) { var o = {}; o[KEY] = m; chrome.storage.local.set(o, function () { res(m); }); });
  }

  function shuffle(n) {
    var a = new Array(n); for (var i = 0; i < n; i++) a[i] = i;
    for (var i = n - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function train(ds, opts) {
    opts = opts || {};
    var epochs = opts.epochs || 100, lr = opts.lr || 0.01, onEpoch = opts.onEpoch || function () {};
    return loadModel().then(function (m) {
      if (!m.meta || !m.meta.trained) m = initRandom();
      var n = ds.length; if (!n) return m;
      for (var e = 0; e < epochs; e++) {
        var idx = shuffle(n), loss = 0, mae = 0;
        for (var k = 0; k < n; k++) { var s = ds[idx[k]]; loss += step(s.x, s.y, m, lr, s.weight); }
        for (var q = 0; q < n; q++) {
          var s2 = ds[idx[q]];
          var pr = forward(s2.x, m).priority;
          var ac = tToP(s2.y);
          mae += Math.abs(pIdx(pr) - pIdx(ac));
        }
        onEpoch(e, { loss: loss / n, maeSteps: mae / n });
        if (e > 0 && e % 20 === 0) lr *= 0.7;
      }
      m.meta = { trained: true, samples: (m.meta.samples || 0) + n, version: (m.meta.version || 1) + 1, lastTrainedAt: Date.now() };
      return saveModel(m);
    });
  }

  function exportModel() { return loadModel().then(function (m) { return JSON.stringify(m); }); }
  function importModel(json) {
    var m = typeof json === 'string' ? JSON.parse(json) : json;
    if (!m || !m.W1 || !m.W2 || !m.W3) throw new Error('Некорректный формат');
    if (m.W1.length !== N_IN) throw new Error('N_IN mismatch');
    return saveModel(m);
  }

  global.PlannigModel = {
    N_IN: N_IN, PRIORITY_MIN: P_MIN, PRIORITY_MAX: P_MAX, PRIORITY_STEP: P_STEP,
    VALID_PRIORITIES: VALID,
    priorityToTarget: pToT, targetToPriority: tToP, snapToValid: snap, priorityIndex: pIdx,
    forward: forward, train: train, loadModel: loadModel, saveModel: saveModel,
    initRandom: initRandom, exportModel: exportModel, importModel: importModel
  };
})(typeof self !== 'undefined' ? self : window);