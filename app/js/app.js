/* app.js — routing, rendering and interval ownership. Global: EB.app */
window.EB = window.EB || {};
(function () {
  var ui = EB.ui, el = ui.el, session = EB.session;
  var view = document.getElementById("view");
  var timerHandle = null;

  function button(text, action, className) {
    return el("button", { type: "button", class: className || "btn", onclick: action }, text);
  }
  function storageWarning() {
    var existing = view.querySelector(".storage-warning");
    if (EB.store.storageAvailable() && session.storageAvailable()) {
      if (existing) existing.remove();
    } else if (!existing) {
      view.prepend(el("p", { class: "storage-warning", role: "status" },
        "Storage is unavailable. Progress or this exam may not survive a reload. Keep this tab open."));
    }
  }
  function begin() { var scroll = window.scrollY; ui.clear(view); return scroll; }
  function finish(scroll, navigate, selector) {
    storageWarning();
    if (navigate) {
      var heading = navigate === "section" ? view.querySelector("h1, h2") : view.querySelector(".qtext[tabindex='-1']") || view.querySelector("h1, h2");
      if (heading) {
        var examHead = view.querySelector(".exam-head");
        heading.style.scrollMarginTop = (examHead ? examHead.getBoundingClientRect().height + 16 : 16) + "px";
        heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true });
        heading.scrollIntoView({ block: "start" });
      } else window.scrollTo(0, 0);
    } else {
      if (selector) { var target = view.querySelector(selector); if (target) target.focus({ preventScroll: true }); }
      window.scrollTo(0, scroll);
    }
  }
  function setActiveTab(name) {
    document.querySelectorAll("#tabs a").forEach(function (a) {
      var active = a.getAttribute("data-tab") === name;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function initTheme() {
    var t = EB.store.settings().theme || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", t);
  }
  function wireTopbar() {
    var theme = document.getElementById("themeToggle"), lang = document.getElementById("langToggle");
    function paint() {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      theme.setAttribute("aria-pressed", String(dark));
      theme.setAttribute("aria-label", "Dark theme");
      lang.textContent = ui.langEN() ? "EN" : "DE";
      lang.setAttribute("aria-pressed", String(ui.langEN()));
      lang.setAttribute("aria-label", "Show English translations");
    }
    theme.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next); EB.store.setSetting("theme", next);
      paint(); storageWarning();
    });
    lang.addEventListener("click", function () {
      EB.store.setSetting("lang", ui.langEN() ? "de" : "en"); paint(); route(true);
    });
    paint();
    document.querySelector(".skip-link").addEventListener("click", function (event) {
      event.preventDefault(); view.focus({ preventScroll: true }); view.scrollIntoView({ block: "start" });
    });
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { location.hash = b.getAttribute("data-go"); });
    });
    var topbar = document.querySelector(".topbar");
    function measureHeader() {
      if (topbar) document.documentElement.style.setProperty("--topbar-height", topbar.getBoundingClientRect().height + "px");
    }
    measureHeader();
    if (window.ResizeObserver && topbar) new ResizeObserver(measureHeader).observe(topbar);
    window.addEventListener("resize", measureHeader);
  }
  function filterBar(mode, render) {
    var state = session.study(mode).filters;
    var bar = el("div", { class: "filters", "aria-label": "Question filters" });
    function chip(label, key, value) {
      var active = key === "category" ? state.category === value : state[key];
      return el("button", { type: "button", class: "fchip" + (active ? " on" : ""), "aria-pressed": String(!!active), onclick: function () {
        var f = Object.assign({}, state);
        f[key] = key === "category" ? value : !f[key];
        session.restart(mode, f); render(true);
      } }, label);
    }
    bar.appendChild(el("div", { class: "filter-group", role: "group", "aria-label": "Category" },
      el("span", { class: "filter-label" }, "Category"), chip("All categories", "category", null),
      chip("General", "category", "general"), chip("Berlin", "category", "berlin")));
    bar.appendChild(el("div", { class: "filter-group", role: "group", "aria-label": "Status filters" },
      el("span", { class: "filter-label" }, "Status"), chip("Unseen", "unseen"), chip("Wrong", "wrong"), chip("Starred", "starred")));
    bar.appendChild(button("Clear filters", function () { session.restart(mode, {}); render(true); }, "fchip"));
    bar.appendChild(button(mode === "browse" ? "Refresh list" : "New round", function () { session.restart(mode); render(true); }, "fchip"));
    return bar;
  }
  function progress(index, total) {
    return el("div", { class: "progress-line" }, el("span", {}, (index + 1) + " / " + total),
      el("div", { class: "bar", "aria-hidden": "true" }, el("span", { style: "width:" + ((index + 1) / total * 100) + "%" })));
  }
  function questionCard(q, index, total, opts) {
    var card = el("div", { class: "qcard" }, progress(index, total), ui.metaRow(q, storageWarning), ui.questionText(q));
    var image = ui.qImage(q); if (image) card.appendChild(image);
    card.appendChild(ui.optionsList(q, opts)); return card;
  }
  function feedback(q, chosen, browse) {
    var right = chosen === q.correct_index;
    return el("div", { class: "feedback " + (browse || right ? "correct" : "wrong"), role: "status", "aria-live": "polite" },
      browse ? "Correct answer: " + ui.LETTERS[q.correct_index] + ". " + q.options[q.correct_index].text_de
        : right ? "Correct." : (chosen === null ? "Unanswered. " : "Incorrect. ") + "Correct answer: " + ui.LETTERS[q.correct_index] + ". " + q.options[q.correct_index].text_de);
  }
  function jumpRow(id, index, total, move) {
    var input = el("input", { id: id, type: "number", min: 1, max: total, value: index + 1, inputmode: "numeric" });
    input.addEventListener("change", function () {
      var n = Number(input.value);
      if (Number.isInteger(n) && n >= 1 && n <= total) move(n - 1); else input.value = index + 1;
    });
    return el("div", { class: "jump-row" }, el("label", { for: id }, "Go to question"), input);
  }
  function emptyState(msg) { return el("div", { class: "empty" }, el("p", {}, msg)); }
  function statTile(n, label) {
    return el("div", { class: "stat-tile" }, el("div", { class: "n" }, String(n)), el("div", { class: "l" }, label));
  }

  function renderHome(navigate) {
    setActiveTab("home");
    var scroll = begin(), st = EB.store.stats(EB.data.ids());
    view.appendChild(el("div", { class: "hero" }, el("h1", {}, "Einbürgerungstest Trainer"),
      el("p", {}, "All 300 general + 10 Berlin questions — official BAMF catalogue, with the answer key from oet.bamf.de and an English explanation on every question.")));
    view.appendChild(el("div", { class: "stat-row" }, statTile(st.seen + "/" + st.total, "seen"),
      statTile(st.mastered, "answered right"), statTile(EB.store.streak().current, "day streak")));
    var modes = el("div", { class: "grid mode-grid" });
    [["Learn", "Understand the reasoning — history, government, the Grundgesetz"],
      ["Vocab", "The test-specific German words, ranked by how often they appear"],
      ["Browse", "Read all questions, reveal answers + English"], ["Quiz", "Answer with instant feedback"],
      ["Exam", "33 questions, 60 min, pass ≥ 17"], ["Focus", "Only what you got wrong or starred"]].forEach(function (m) {
      modes.appendChild(el("a", { class: "mode-card", href: "#/" + m[0].toLowerCase() },
        el("h2", { class: "mc-title" }, m[0]), el("div", { class: "mc-desc" }, m[1])));
    });
    view.appendChild(modes); finish(scroll, navigate);
  }
  function renderBrowse(navigate, selector) {
    setActiveTab("browse");
    var scroll = begin(), s = session.study("browse"), q = session.current("browse"), a = session.questionState("browse");
    view.appendChild(el("h1", { class: "section-title" }, "Browse"));
    view.appendChild(el("div", { class: "section-sub" }, s.ids.length + " questions in view"));
    view.appendChild(filterBar("browse", renderBrowse));
    if (!q) { view.appendChild(emptyState("No questions match these filters.")); finish(scroll, navigate); return; }
    EB.store.markSeen(q.id); EB.store.save();
    var card = questionCard(q, s.idx, s.ids.length, { interactive: false, revealed: a.revealed });
    if (a.revealed) card.appendChild(feedback(q, null, true));
    function move(idx) { session.move("browse", idx); renderBrowse(true); }
    var reveal = button(a.revealed ? "Hide answer" : "Show answer", function () {
      session.reveal("browse", !a.revealed); renderBrowse(false, ".reveal-answer");
    }, "btn primary reveal-answer");
    var prev = button("Previous", function () { move(s.idx - 1); }); prev.disabled = s.idx === 0;
    var next = button("Next", function () { move((s.idx + 1) % s.ids.length); });
    card.appendChild(el("div", { class: "study-actions" }, reveal, prev, next));
    card.appendChild(jumpRow("browse-jump", s.idx, s.ids.length, move));
    card.appendChild(ui.disclosure(q, { open: a.disclosure, onToggle: function (open) {
      if (a.disclosure === open) return;
      var firstReveal = open && !a.revealed;
      session.disclosure("browse", open);
      if (firstReveal) renderBrowse(false, "details summary");
    } }));
    view.appendChild(card); finish(scroll, navigate, selector);
  }
  function renderDeck(mode, navigate, selector) {
    setActiveTab(mode);
    var scroll = begin(), s = session.study(mode), title = mode === "quiz" ? "Quiz" : "Focus";
    function render(go) { renderDeck(mode, go); }
    view.appendChild(el("h1", { class: "section-title" }, title));
    view.appendChild(el("div", { class: "section-sub" }, s.ids.length + " questions · session score " + s.right + "/" + s.done));
    if (mode === "quiz") view.appendChild(filterBar(mode, render));
    else view.appendChild(el("div", { class: "controls" }, button("Refresh round", function () { session.restart(mode); render(true); })));
    if (!s.ids.length) {
      view.appendChild(emptyState(mode === "focus" ? "Nothing to review yet. Answer some questions (wrong ones land here) or star questions in Browse." : "No questions match these filters."));
      finish(scroll, navigate); return;
    }
    if (s.idx >= s.ids.length) {
      view.appendChild(el("div", { class: "result-hero" }, el("div", { class: "big" }, s.right + "/" + s.done),
        el("h2", { class: "verdict" }, "Round complete"), el("div", { class: "controls center-controls" },
          button("Go again", function () { session.restart(mode); render(true); }, "btn primary"))));
      finish(scroll, navigate); return;
    }
    var q = session.current(mode), a = session.questionState(mode);
    var card = questionCard(q, s.idx, s.ids.length, { interactive: !a.answered, revealed: a.revealed, chosen: a.chosen,
      onPick: function (i) { if (session.answer(mode, i)) renderDeck(mode, false, ".next-question"); } });
    if (a.answered) card.appendChild(feedback(q, a.chosen));
    var actions = el("div", { class: "study-actions" });
    function next() { session.move(mode, s.idx + 1); render(true); }
    actions.appendChild(button(a.answered ? (s.idx + 1 === s.ids.length ? "Finish" : "Next") : "Skip", next,
      a.answered ? "btn primary next-question" : "btn"));
    card.appendChild(actions);
    if (a.answered) card.appendChild(ui.disclosure(q, { open: a.disclosure, onToggle: function (open) { session.disclosure(mode, open); } }));
    view.appendChild(card); finish(scroll, navigate, selector);
  }

  function stopTimer() { if (timerHandle !== null) { clearInterval(timerHandle); timerHandle = null; } }
  function renderExam(navigate) {
    setActiveTab("exam"); stopTimer();
    var s = session.exam();
    if (!s) renderExamStart(navigate); else if (s.submitted) renderExamResult(s, navigate); else renderExamRun(s, navigate);
  }
  function historyRows(limit, timing) {
    var box = el("div", {});
    EB.store.exams().slice(0, limit).forEach(function (e) {
      box.appendChild(el("div", { class: "history-row" },
        el("span", {}, e.date + (timing ? " · " + Math.round(e.durationSec / 60) + " min" : "")),
        el("span", { class: "history-score " + (e.passed ? "pass" : "fail") }, e.score + "/33 " + (e.passed ? "PASS" : "FAIL"))));
    });
    return box;
  }
  function renderExamStart(navigate) {
    stopTimer();
    var scroll = begin();
    view.appendChild(el("h1", { class: "section-title" }, "Exam simulation"));
    view.appendChild(el("div", { class: "section-sub" }, "33 questions (30 general + 3 Berlin) · 60 minutes · pass with 17 correct — exactly like the real Einbürgerungstest."));
    var card = el("div", { class: "qcard" }, el("div", { class: "study-actions" }, button("Start exam", function () {
      var s = session.startExam(); if (s) renderExamRun(s, true);
    }, "btn primary")));
    if (EB.store.exams().length) card.appendChild(el("h2", { class: "history-heading" }, "Past attempts"));
    card.appendChild(historyRows(8, true)); view.appendChild(card); finish(scroll, navigate);
  }
  function navigator(s, render) {
    var details = el("details", { class: "exam-navigator" }, el("summary", {}, "Question navigator"));
    details.open = s.navigatorOpen;
    details.addEventListener("toggle", function () {
      if (s.navigatorOpen !== details.open) { session.examNavigator(details.open); storageWarning(); }
    });
    var grid = el("div", { class: "question-grid", role: "group", "aria-label": "Choose question" });
    s.ids.forEach(function (id, n) {
      var answered = Object.prototype.hasOwnProperty.call(s.answers, id), current = n === s.idx;
      var b = button(String(n + 1), function () { session.moveExam(n); render(true); },
        (current ? "current " : "") + (answered ? "answered" : "unanswered"));
      b.setAttribute("aria-label", "Question " + (n + 1) + (answered ? ", answered" : ", unanswered"));
      if (current) b.setAttribute("aria-current", "step");
      grid.appendChild(b);
    });
    details.appendChild(grid); return details;
  }
  function examActions(s, render) {
    var prev = button("Previous", function () { session.moveExam(s.idx - 1); render(true); });
    var next = button("Next", function () { session.moveExam(s.idx + 1); render(true); }, "btn primary");
    prev.disabled = s.idx === 0; next.disabled = s.idx === s.ids.length - 1;
    return el("div", { class: "study-actions" }, prev, next);
  }
  function submitExam() {
    stopTimer(); session.submitExam();
    var s = session.exam(); if (s) renderExamResult(s, "section");
  }
  function renderExamRun(s, navigate, selector) {
    stopTimer();
    var scroll = begin();
    function render(go) { renderExamRun(s, go); }
    var timer = el("span", { class: "timer", role: "timer", "aria-label": "Time remaining", "aria-live": "off" });
    var count = Object.keys(s.answers).length;
    var submit = button("Submit", function () {
      if (session.remaining() <= 0) { submitExam(); return; }
      if (count < s.ids.length && !confirm((s.ids.length - count) + " questions are unanswered. Submit anyway?")) return;
      submitExam();
    }, "btn primary");
    view.appendChild(el("div", { class: "exam-head" }, timer, el("span", { class: "exam-progress" }, count + " / 33 answered"), submit));
    var q = EB.data.byId(s.ids[s.idx]);
    var card = questionCard(q, s.idx, s.ids.length, { interactive: true, revealed: false,
      chosen: Object.prototype.hasOwnProperty.call(s.answers, q.id) ? s.answers[q.id] : null,
      onPick: function (i) {
        if (!session.chooseExam(i)) { if (session.remaining() <= 0) submitExam(); return; }
        renderExamRun(s, false, ".opt:nth-child(" + (i + 1) + ")");
      } });
    card.appendChild(examActions(s, render)); view.appendChild(card); view.appendChild(navigator(s, render));
    function tick() {
      var left = session.remaining();
      if (s.submitted) { stopTimer(); return false; }
      if (left <= 0) { submitExam(); return false; }
      timer.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
      timer.classList.toggle("warn", left <= 300); return true;
    }
    // An expired resume may synchronously submit. Never install a timer afterward.
    if (tick()) {
      finish(scroll, navigate, selector); // Measure the header with its timer text present.
      timerHandle = setInterval(tick, 1000);
    }
  }
  function renderExamResult(s, navigate) {
    stopTimer();
    var scroll = begin();
    view.appendChild(el("div", { class: "result-hero " + (s.passed === true ? "pass" : s.passed === false ? "fail" : "") },
      el("div", { class: "big" }, s.score === null ? "Submitted" : s.score + "/33"),
      el("h1", { class: "verdict" }, s.passed === true ? "PASSED (need 17)" : s.passed === false ? "Not passed — need 17" : "Saved result unavailable"),
      el("div", { class: "section-sub" }, "Time: " + Math.round(s.durationSec / 60) + " min")));
    view.appendChild(el("div", { class: "controls center-controls" }, button("New exam", function () { session.clearExam(); renderExamStart(true); }, "btn primary")));
    view.appendChild(el("h2", { class: "section-title" }, "Review"));
    var q = EB.data.byId(s.ids[s.idx]);
    var chosen = Object.prototype.hasOwnProperty.call(s.answers, q.id) ? s.answers[q.id] : null;
    function render(go) { renderExamResult(s, go); }
    var card = questionCard(q, s.idx, s.ids.length, { interactive: false, revealed: true, chosen: chosen });
    card.classList.add("exam-review"); card.appendChild(feedback(q, chosen));
    card.appendChild(examActions(s, render));
    card.appendChild(ui.disclosure(q, { open: !!s.reviewDisclosure[q.id], onToggle: function (open) {
      if (!!s.reviewDisclosure[q.id] !== open) { session.reviewDisclosure(open); storageWarning(); }
    } }));
    view.appendChild(card); view.appendChild(navigator(s, render)); finish(scroll, navigate);
  }

  function renderStats(navigate) {
    setActiveTab("stats");
    var scroll = begin(), st = EB.store.stats(EB.data.ids());
    view.appendChild(el("h1", { class: "section-title" }, "Your progress"));
    function line(label, value, cls) {
      return el("div", { class: "stat-progress" }, el("div", { class: "stat-progress-label" }, el("span", {}, label), el("b", {}, value + " / " + st.total)),
        el("div", { class: "bar " + (cls || ""), "aria-hidden": "true" }, el("span", { style: "width:" + (st.total ? value / st.total * 100 : 0) + "%" })));
    }
    view.appendChild(el("div", { class: "qcard" }, line("Seen at least once", st.seen), line("Last answer correct", st.mastered, "correct"),
      el("div", { class: "stat-row" }, statTile(st.wrongNow, "currently wrong"), statTile(st.starred, "starred"), statTile(EB.store.streak().best, "best streak"))));
    if (EB.store.exams().length) {
      view.appendChild(el("h2", { class: "section-title history-heading" }, "Exam history"));
      view.appendChild(el("div", { class: "qcard" }, historyRows(15, false)));
    }
    view.appendChild(el("div", { class: "controls center-controls" }, button("Reset all progress", function () {
      if (confirm("Erase all progress, stars, streak and exam history?")) { EB.store.reset(); session.resetStudy(); renderStats(false); }
    })));
    finish(scroll, navigate);
  }
  function route(cosmetic) {
    stopTimer();
    var h = (location.hash || "#/home").replace(/^#/, ""), navigate = cosmetic === true ? false : "section";
    if (h === "/browse") renderBrowse(navigate);
    else if (h === "/quiz") renderDeck("quiz", navigate);
    else if (h === "/focus") renderDeck("focus", navigate);
    else if (h === "/exam") renderExam(navigate);
    else if (h === "/stats") renderStats(navigate);
    else if (h === "/learn" && EB.learn) EB.learn.renderIndex(navigate);
    else if (h.slice(0, 7) === "/learn/" && EB.learn) EB.learn.renderLesson(decodeURIComponent(h.slice(7)), navigate);
    else if (h === "/vocab" && EB.vocab) EB.vocab.render(navigate);
    else renderHome(navigate);
  }
  function init() {
    if (!EB.data.ready()) {
      ui.clear(view); view.appendChild(emptyState("Question data failed to load. Keep data/questions.js beside the app; both file:// and HTTP are supported.")); return;
    }
    initTheme(); wireTopbar(); window.addEventListener("hashchange", route); route();
  }
  EB.app = { init: init, view: view, begin: begin, finish: finish, setActiveTab: setActiveTab, storageWarning: storageWarning, button: button };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
