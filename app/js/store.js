/* store.js — persistent progress, with a usable in-memory fallback. Global: EB.store */
window.EB = window.EB || {};
(function () {
  var KEY = "eb_state_v1";
  var available = true;
  function defaults() {
    return {
      seen: {}, correct: {}, wrong: {}, last: {}, starred: {},
      streak: { current: 0, best: 0, lastStudyDate: null }, exams: [],
      settings: { lang: "de", theme: null }
    };
  }
  function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function integer(v) { return Number.isSafeInteger(v) && v >= 0; }
  function questionId(k) { return /^[1-9]\d*$/.test(k) && Number(k) <= 310; }
  function date(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  }
  function normalize(p) {
    var d = defaults();
    if (!object(p)) return d;
    ["seen", "correct", "wrong", "last", "starred"].forEach(function (field) {
      if (!object(p[field])) return;
      Object.keys(p[field]).forEach(function (id) {
        if (!questionId(id)) return;
        var v = p[field][id];
        var valid = field === "last" ? v === "right" || v === "wrong"
          : field === "correct" || field === "wrong" ? integer(v) : v === true;
        if (valid) d[field][id] = v;
      });
    });
    if (object(p.settings)) {
      if (p.settings.lang === "en" || p.settings.lang === "de") d.settings.lang = p.settings.lang;
      if (p.settings.theme === "light" || p.settings.theme === "dark") d.settings.theme = p.settings.theme;
    }
    if (object(p.streak)) {
      if (integer(p.streak.current)) d.streak.current = p.streak.current;
      if (integer(p.streak.best)) d.streak.best = p.streak.best;
      d.streak.best = Math.max(d.streak.current, d.streak.best);
      if (date(p.streak.lastStudyDate)) d.streak.lastStudyDate = p.streak.lastStudyDate;
    }
    if (Array.isArray(p.exams)) {
      d.exams = p.exams.filter(function (e) {
        return object(e) && date(e.date) && integer(e.score) && e.score <= 33 &&
          (e.total === undefined || e.total === 33) && typeof e.passed === "boolean" && integer(e.durationSec);
      }).slice(0, 50);
    }
    return d;
  }
  var state = defaults();
  function load() {
    var raw;
    try { raw = localStorage.getItem(KEY); available = true; }
    catch (e) { available = false; return state; }
    try { state = normalize(raw ? JSON.parse(raw) : null); }
    catch (e) { state = defaults(); }
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); available = true; }
    catch (e) { available = false; }
    return available;
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function touchStreak() {
    var t = todayStr(), st = state.streak;
    if (st.lastStudyDate === t) return;
    var diff = st.lastStudyDate ? (Date.parse(t) - Date.parse(st.lastStudyDate)) / 86400000 : Infinity;
    st.current = diff === 1 ? st.current + 1 : 1;
    st.best = Math.max(st.current, st.best);
    st.lastStudyDate = t;
  }
  EB.store = {
    load: load, save: save,
    storageAvailable: function () { return available; },
    get: function () { return state; },
    settings: function () { return state.settings; },
    setSetting: function (k, v) {
      if ((k === "lang" && (v === "de" || v === "en")) ||
          (k === "theme" && (v === null || v === "light" || v === "dark"))) {
        state.settings[k] = v; save();
      }
    },
    markSeen: function (id) { if (questionId(String(id))) state.seen[id] = true; },
    recordAnswer: function (id, isRight) {
      if (!questionId(String(id))) return;
      state.seen[id] = true;
      var field = isRight ? "correct" : "wrong";
      state[field][id] = (state[field][id] || 0) + 1;
      state.last[id] = isRight ? "right" : "wrong";
      touchStreak(); save();
    },
    lastResult: function (id) { return state.last[id] || null; },
    isSeen: function (id) { return !!state.seen[id]; },
    isStarred: function (id) { return !!state.starred[id]; },
    toggleStar: function (id) {
      if (!questionId(String(id))) return false;
      if (state.starred[id]) delete state.starred[id]; else state.starred[id] = true;
      save(); return !!state.starred[id];
    },
    starredIds: function () { return Object.keys(state.starred).map(Number); },
    wrongIds: function () { return Object.keys(state.last).filter(function (id) { return state.last[id] === "wrong"; }).map(Number); },
    addExam: function (r) { state.exams.unshift(r); if (state.exams.length > 50) state.exams.length = 50; touchStreak(); save(); },
    exams: function () { return state.exams; },
    streak: function () { return state.streak; },
    stats: function (allIds) {
      var seen = 0, mastered = 0, wrongNow = 0;
      allIds.forEach(function (id) {
        if (state.seen[id]) seen++;
        if (state.last[id] === "right") mastered++;
        if (state.last[id] === "wrong") wrongNow++;
      });
      return { total: allIds.length, seen: seen, mastered: mastered, wrongNow: wrongNow, starred: Object.keys(state.starred).length };
    },
    reset: function () { state = defaults(); save(); }
  };
  load();
})();
