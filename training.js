// training.js – сбор датасета и обучение.
(function (global) {
  'use strict';

  function buildDataset(history) {
    var ds = [];
    var F = global.PlannigForecast, M = global.PlannigModel;
    if (!F || !M) return ds;
    for (var i = 20; i < history.length; i++) {
      var e = history[i];
      if (e.type !== 'priority_set' || e.priority == null) continue;
      if (e.priority < M.PRIORITY_MIN || e.priority > M.PRIORITY_MAX) continue;
      var past = history.slice(0, i);
      var f = F._extractFeatures(past, e.recordedAt);
      var x = F._featuresToVector(f);
      var y = M.priorityToTarget(e.priority);
      ds.push({ x: x, y: y, priority: e.priority });
    }
    return ds;
  }

  function applyWeights(ds) {
    var freq = {}, i;
    for (i = 0; i < ds.length; i++) { var p = ds[i].priority; freq[p] = (freq[p] || 0) + 1; }
    var n = ds.length, wsum = 0;
    for (i = 0; i < ds.length; i++) { ds[i].weight = 1 / freq[ds[i].priority]; wsum += ds[i].weight; }
    if (wsum > 0) for (i = 0; i < ds.length; i++) ds[i].weight *= n / wsum;
    return ds;
  }

  function trainFromHistory(opts) {
    opts = opts || {};
    return global.PlannigForecast.getHistory().then(function (h) {
      var ds = buildDataset(h);
      if (ds.length < 30) return { ok: false, error: 'Мало данных: ' + ds.length };
      applyWeights(ds);
      return global.PlannigModel.train(ds, opts).then(function (m) {
        return { ok: true, samples: ds.length, model: m };
      });
    });
  }

  function validate() {
    return global.PlannigForecast.getHistory().then(function (h) {
      var ds = buildDataset(h);
      if (ds.length < 50) return { ok: false, error: 'Мало данных' };
      var cut = Math.floor(ds.length * 0.8);
      var tr = ds.slice(0, cut), te = ds.slice(cut);
      applyWeights(tr);
      var M = global.PlannigModel;
      return M.loadModel().then(function (base) {
        var saved = JSON.stringify(base);
        return M.train(tr, { epochs: 60, lr: 0.01 }).then(function () {
          return M.loadModel();
        }).then(function (trained) {
          var mae = 0;
          for (var i = 0; i < te.length; i++) {
            var p = M.forward(te[i].x, trained).priority;
            mae += Math.abs(M.priorityIndex(p) - M.priorityIndex(te[i].priority));
          }
          return M.importModel(saved).then(function () {
            return { ok: true, maeSteps: mae / te.length, testSamples: te.length };
          });
        });
      });
    });
  }

  global.PlannigTraining = { buildDataset: buildDataset, applyWeights: applyWeights,
                             trainFromHistory: trainFromHistory, validate: validate };
})(typeof self !== 'undefined' ? self : window);