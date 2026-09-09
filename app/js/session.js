/* session.js — DOM-free study rounds and validated live exam state. Global: EB.session */
window.EB = window.EB || {};
(function () {
  var EXAM_KEY = "eb_exam_session_v1";
  var rounds = {}, liveExam = null, examLoaded = false, available = true;
  function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function choice(v) { return Number.isInteger(v) && v >= 0 && v < 4; }
  function filters(v) {
    v = v || {};
    return { category: v.category === "general" || v.category === "berlin" ? v.category : null,
      unseen: v.unseen === true, wrong: v.wrong === true, starred: v.starred === true };
  }
  function restart(mode, nextFilters) {
    var f = filters(nextFilters || (rounds[mode] && rounds[mode].filters));
    var list;
    if (mode === "focus") {
      var ids = new Set(EB.store.wrongIds().concat(EB.store.starredIds()));
      list = EB.data.all().filter(function (q) { return ids.has(q.id); });
    } else list = EB.data.filter(f);
    if (mode !== "browse") list = EB.data.shuffle(list);
    rounds[mode] = { filters: f, ids: list.map(function (q) { return q.id; }), idx: 0, questions: {}, right: 0, done: 0 };
    return rounds[mode];
  }
  function study(mode) { return rounds[mode] || restart(mode); }
  function current(mode) { var s = study(mode); return EB.data.byId(s.ids[s.idx]); }
  function questionState(mode) {
    var s = study(mode), id = s.ids[s.idx];
    if (id === undefined) return null;
    if (!s.questions[id]) s.questions[id] = { chosen: null, answered: false, revealed: false, disclosure: false };
    return s.questions[id];
  }
  function answer(mode, i) {
    var s = study(mode), q = current(mode), a = questionState(mode);
    if (mode === "browse" || !q || !a || a.answered || !choice(i)) return false;
    a.chosen = i; a.answered = true; a.revealed = true;
    s.done++;
    var right = i === q.correct_index;
    if (right) s.right++;
    EB.store.recordAnswer(q.id, right);
    return true;
  }
  function move(mode, idx) {
    var s = study(mode), max = mode === "browse" ? s.ids.length - 1 : s.ids.length;
    if (!Number.isInteger(idx) || idx < 0 || idx > max) return false;
    s.idx = idx; return true;
  }
  function validateExam(p) {
    if (!object(p) || !Array.isArray(p.ids) || p.ids.length !== 33 || new Set(p.ids).size !== 33) return null;
    var general = 0, berlin = 0;
    for (var n = 0; n < p.ids.length; n++) {
      var id = p.ids[n], q = Number.isInteger(id) && EB.data.byId(id);
      if (!q) return null;
      if (q.exam_pool === "general") general++; else if (q.exam_pool === "berlin") berlin++;
    }
    if (general !== 30 || berlin !== 3 || !Number.isFinite(p.start) || p.start <= 0 ||
        p.start > Date.now() || p.duration !== 3600 || typeof p.submitted !== "boolean") return null;
    var s = { ids: p.ids.slice(), answers: {}, idx: Number.isInteger(p.idx) && p.idx >= 0 && p.idx < 33 ? p.idx : 0,
      start: p.start, duration: 3600, submitted: p.submitted,
      navigatorOpen: p.navigatorOpen === true, reviewDisclosure: {} };
    if (object(p.answers)) s.ids.forEach(function (id) { if (choice(p.answers[id])) s.answers[id] = p.answers[id]; });
    if (object(p.reviewDisclosure)) s.ids.forEach(function (id) { if (p.reviewDisclosure[id] === true) s.reviewDisclosure[id] = true; });
    if (s.submitted) {
      // Legacy submitted records are results, never invitations to grade again.
      s.score = Number.isInteger(p.score) && p.score >= 0 && p.score <= 33 ? p.score : null;
      s.passed = typeof p.passed === "boolean" ? p.passed : null;
      s.durationSec = Number.isFinite(p.durationSec) && p.durationSec >= 0 ? p.durationSec : 0;
    }
    return s;
  }
  function exam() {
    if (examLoaded) return liveExam;
    examLoaded = true;
    var raw;
    try { raw = sessionStorage.getItem(EXAM_KEY); available = true; }
    catch (e) { available = false; return liveExam; }
    try { liveExam = validateExam(raw ? JSON.parse(raw) : null); }
    catch (e) { liveExam = null; }
    return liveExam;
  }
  function saveExam() {
    try {
      if (liveExam) sessionStorage.setItem(EXAM_KEY, JSON.stringify(liveExam));
      else sessionStorage.removeItem(EXAM_KEY);
      available = true;
    } catch (e) { available = false; }
    return available;
  }
  function startExam() {
    liveExam = validateExam({ ids: EB.data.sampleExam().map(function (q) { return q.id; }),
      answers: {}, idx: 0, start: Date.now(), duration: 3600, submitted: false });
    examLoaded = true; saveExam(); return liveExam;
  }
  function remaining(now) {
    var s = exam();
    return !s || s.submitted ? 0 : Math.max(0, s.duration - Math.floor(((now === undefined ? Date.now() : now) - s.start) / 1000));
  }
  function chooseExam(i) {
    var s = exam();
    if (!s || s.submitted || !choice(i) || remaining() <= 0) return false;
    s.answers[s.ids[s.idx]] = i; saveExam(); return true;
  }
  function moveExam(idx) {
    var s = exam();
    if (!s || !Number.isInteger(idx) || idx < 0 || idx >= s.ids.length) return false;
    s.idx = idx; saveExam(); return true;
  }
  function submitExam(now) {
    var s = exam();
    if (!s || s.submitted) return false;
    s.submitted = true; // Guard before any persistence or progress side effects.
    now = now === undefined ? Date.now() : now;
    var attemptId = s.start + ":" + s.ids.join(",");
    var prior = EB.store.exams().find(function (r) { return r.attemptId === attemptId; });
    if (prior) {
      // A previous sessionStorage write may have failed while history succeeded.
      s.score = prior.score; s.passed = prior.passed; s.durationSec = prior.durationSec;
      saveExam(); return true;
    }
    s.durationSec = Math.max(0, Math.min(s.duration, Math.round((now - s.start) / 1000)));
    s.score = s.ids.reduce(function (sum, id) { return sum + (s.answers[id] === EB.data.byId(id).correct_index ? 1 : 0); }, 0);
    s.passed = s.score >= 17;
    saveExam();
    s.ids.forEach(function (id) {
      if (choice(s.answers[id])) EB.store.recordAnswer(id, s.answers[id] === EB.data.byId(id).correct_index);
    });
    EB.store.addExam({ attemptId: attemptId, date: new Date(now).toISOString().slice(0, 10),
      score: s.score, total: 33, passed: s.passed, durationSec: s.durationSec });
    return true;
  }
  EB.session = {
    study: study, restart: restart, current: current, questionState: questionState, answer: answer, move: move,
    resetStudy: function () { rounds = {}; },
    reveal: function (mode, open) {
      var a = questionState(mode);
      if (a) { a.revealed = !!open; if (!open) a.disclosure = false; }
    },
    disclosure: function (mode, open) {
      var a = questionState(mode);
      if (a) { a.disclosure = !!open; if (open && mode === "browse") a.revealed = true; }
    },
    exam: exam, startExam: startExam, chooseExam: chooseExam, moveExam: moveExam,
    remaining: remaining, submitExam: submitExam, validateExam: validateExam,
    clearExam: function () { liveExam = null; examLoaded = true; saveExam(); },
    examNavigator: function (open) { var s = exam(); if (s) { s.navigatorOpen = !!open; saveExam(); } },
    reviewDisclosure: function (open) { var s = exam(); if (s && s.submitted) { s.reviewDisclosure[s.ids[s.idx]] = !!open; saveExam(); } },
    storageAvailable: function () { return available; }
  };
})();
