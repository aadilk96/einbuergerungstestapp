/* data.js — question access, filtering, exam sampling. Global: EB.data */
window.EB = window.EB || {};
(function () {
  var raw = window.QUESTIONS || { questions: [], counts: {} };
  var questions = raw.questions || [];
  var byId = {};
  questions.forEach(function (q) { byId[q.id] = q; });

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  EB.data = {
    meta: { version: raw.version, source: raw.source, counts: raw.counts },
    all: function () { return questions; },
    ids: function () { return questions.map(function (q) { return q.id; }); },
    byId: function (id) { return byId[id]; },
    general: function () { return questions.filter(function (q) { return q.exam_pool === "general"; }); },
    berlin: function () { return questions.filter(function (q) { return q.exam_pool === "berlin"; }); },

    // filter by set of criteria used across Browse/Quiz/Focus
    filter: function (opts) {
      opts = opts || {};
      return questions.filter(function (q) {
        if (opts.category && q.category !== opts.category) return false;
        if (opts.unseen && EB.store.isSeen(q.id)) return false;
        if (opts.wrong && EB.store.lastResult(q.id) !== "wrong") return false;
        if (opts.starred && !EB.store.isStarred(q.id)) return false;
        return true;
      });
    },

    // realistic exam: 30 general + 3 Berlin, shuffled
    sampleExam: function () {
      var g = shuffle(EB.data.general()).slice(0, 30);
      var b = shuffle(EB.data.berlin()).slice(0, 3);
      return shuffle(g.concat(b));
    },
    shuffle: shuffle,
    ready: function () { return questions.length > 0; }
  };
})();
