/* vocab.js — "Vocab" mode: the test-specific German vocabulary, ranked by how often it
   appears across the official 310-question pool. Data from window.VOCAB. Renders WITHOUT
   innerHTML (authored strings pass through EB.ui.el, which wraps them in text nodes).

   Like Learn, a term never restates the answer key: the questions each word appears in are
   rendered live from window.QUESTIONS via EB.ui parts, so the counts and examples can never
   drift from the verified answers. Global: EB.vocab. */
window.EB = window.EB || {};
(function () {
  var ui = EB.ui, el = ui.el;
  var raw = window.VOCAB || { version: 0, entries: [], categories: [], reading: [] };
  var ENTRIES = Array.isArray(raw.entries) ? raw.entries : [];
  var CATS = Array.isArray(raw.categories) ? raw.categories : [];
  var READING = Array.isArray(raw.reading) ? raw.reading : [];
  var POOL = typeof raw.pool === "number" ? raw.pool : 310;

  var catTitle = {};
  CATS.forEach(function (c) { catTitle[c.id] = c.title; });

  var TIERS = [
    { tier: 1, label: "Critical — learn these cold" },
    { tier: 2, label: "High value" },
    { tier: 3, label: "Solid to know" }
  ];

  // Entries in importance order (rank ascending; the data is pre-ranked).
  var ordered = ENTRIES.slice().sort(function (a, b) {
    return (a.rank == null ? 999 : a.rank) - (b.rank == null ? 999 : b.rank);
  });

  var filter = null; // active topic filter (category id) or null for "all"

  /* ---------- live verified question, reusing EB.ui parts (never restates the key) ---------- */
  function referenceCard(q) {
    if (!q) return null;
    var card = el("div", { class: "qcard learn-qref" });
    card.appendChild(ui.metaRow(q, EB.app && EB.app.storageWarning));
    card.appendChild(ui.questionText(q));
    var img = ui.qImage(q);
    if (img) card.appendChild(img);
    card.appendChild(ui.optionsList(q, { interactive: false, revealed: true }));
    card.appendChild(ui.disclosure(q));
    return card;
  }

  // Collapsible group of live question cards; builds them lazily on first open.
  function questionGroup(ids) {
    var list = (ids || []).map(Number).filter(function (id) { return !!EB.data.byId(id); });
    var details = el("details", { class: "learn-qgroup" });
    var n = list.length;
    details.appendChild(el("summary", {}, "Show " + n + " example question" + (n === 1 ? "" : "s")));
    var body = el("div", { class: "learn-qgroup-body" });
    details.appendChild(body);
    var built = false;
    details.addEventListener("toggle", function () {
      if (!details.open || built) return;
      built = true;
      if (!n) { body.appendChild(el("p", { class: "learn-muted" }, "No linked questions.")); return; }
      list.forEach(function (id) { var c = referenceCard(EB.data.byId(id)); if (c) body.appendChild(c); });
    });
    return details;
  }

  function chip(text, hot) {
    return el("span", { class: "vocab-chip" + (hot ? " hot" : "") }, text);
  }

  /* ---------- one ranked vocabulary entry ---------- */
  function termRow(e) {
    var known = EB.store.isVocabKnown && EB.store.isVocabKnown(e.id);
    var row = el("div", { class: "learn-card vocab-row" + (known ? " read" : "") });
    row.appendChild(el("div", { class: "learn-card-num vocab-rank" }, "#" + e.rank));

    var main = el("div", { class: "learn-card-main" });
    main.appendChild(el("div", { class: "vocab-de", lang: "de" }, e.de));
    if (ui.langEN() && e.en) main.appendChild(el("div", { class: "vocab-en", lang: "en", text: e.en }));

    var meta = el("div", { class: "learn-card-meta vocab-chips" });
    meta.appendChild(chip("in " + e.df + " / " + POOL + " Fragen", e.df >= 25));
    if (e.cor) meta.appendChild(chip("Antwort " + e.cor + "×"));
    if (catTitle[e.cat]) meta.appendChild(el("span", { class: "vocab-topic" }, catTitle[e.cat]));
    main.appendChild(meta);

    if (ui.langEN() && e.note) main.appendChild(el("div", { class: "vocab-note", lang: "en", text: e.note }));
    if (e.ex && e.ex.length) main.appendChild(questionGroup(e.ex));
    row.appendChild(main);

    if (EB.store.markVocabKnown) {
      var tick = el("button", {
        type: "button", class: "vocab-known" + (known ? " on" : ""),
        title: "Mark as known", "aria-label": "Mark “" + e.de + "” as known",
        "aria-pressed": String(known)
      }, el("span", { "aria-hidden": "true" }, "✓"));
      tick.addEventListener("click", function () {
        var now = !EB.store.isVocabKnown(e.id);
        EB.store.markVocabKnown(e.id, now);
        tick.classList.toggle("on", now);
        tick.setAttribute("aria-pressed", String(now));
        row.classList.toggle("read", now);
        var bar = document.getElementById("vocabProgressBar");
        var lbl = document.getElementById("vocabProgressCount");
        if (bar && lbl) {
          var c = EB.store.knownVocabCount();
          bar.style.width = (ordered.length ? c / ordered.length * 100 : 0) + "%";
          lbl.textContent = c + " / " + ordered.length;
        }
        EB.app.storageWarning && EB.app.storageWarning();
      });
      row.appendChild(tick);
    }
    return row;
  }

  /* ---------- topic filter chips ---------- */
  function filterBar(rerender) {
    var bar = el("div", { class: "filters", "aria-label": "Filter vocabulary by topic" });
    var group = el("div", { class: "filter-group", role: "group", "aria-label": "Topic" },
      el("span", { class: "filter-label" }, "Topic"));
    function fchip(label, value) {
      var active = filter === value;
      return el("button", {
        type: "button", class: "fchip" + (active ? " on" : ""), "aria-pressed": String(active),
        onclick: function () { filter = value; rerender(); }
      }, label);
    }
    group.appendChild(fchip("All topics", null));
    CATS.forEach(function (c) {
      if (ordered.some(function (e) { return e.cat === c.id; })) group.appendChild(fchip(c.title, c.id));
    });
    bar.appendChild(group);
    return bar;
  }

  /* ---------- reading aside (general German, deliberately not ranked) ---------- */
  function readingAside() {
    if (!READING.length) return null;
    var d = el("details", { class: "learn-deeper vocab-reading" });
    d.appendChild(el("summary", {},
      el("span", { class: "learn-deeper-label" }, "Read carefully"),
      el("span", { class: "learn-deeper-head" }, "General German — not test vocabulary, but it decides points")));
    var body = el("div", { class: "learn-deeper-body" });
    body.appendChild(el("p", { class: "learn-muted" },
      "These are everyday German words, so they are left out of the ranking above — but misreading one flips a correct answer. Drill the distinctions, not the words."));
    READING.forEach(function (g) {
      body.appendChild(el("h4", { class: "learn-subhead" }, g.label));
      var ul = el("ul", { class: "learn-list" });
      (g.items || []).forEach(function (it) {
        ul.appendChild(el("li", {}, el("b", { lang: "de" }, it[0]), " — ", el("span", { lang: "en" }, it[1])));
      });
      body.appendChild(ul);
    });
    d.appendChild(body);
    return d;
  }

  /* ---------- index view (#/vocab) ---------- */
  function render(navigate) {
    EB.app.setActiveTab("vocab");
    var scroll = EB.app.begin(), view = EB.app.view;
    function rerender() { render(false); }

    view.appendChild(el("h1", { class: "section-title" }, "Vocab"));
    view.appendChild(el("div", { class: "section-sub" },
      "The test-specific civic vocabulary, ranked by how many of the " + POOL + " official questions it appears in — the words the Einbürgerungstest is actually about. " +
      "“in N Fragen” = questions it appears in; “Antwort M×” = of those, how many have it inside the correct answer. Turn on DE/EN for the English gloss."));

    if (!ordered.length) {
      view.appendChild(el("div", { class: "empty" }, el("p", {}, "No vocabulary loaded. Keep data/vocab.js beside the app.")));
      EB.app.finish(scroll, navigate); return;
    }

    // progress
    if (EB.store.knownVocabCount) {
      var known = EB.store.knownVocabCount(), tot = ordered.length;
      view.appendChild(el("div", { class: "qcard learn-progress" },
        el("div", { class: "stat-progress-label" },
          el("span", {}, "Words marked known"), el("b", { id: "vocabProgressCount" }, known + " / " + tot)),
        el("div", { class: "bar", "aria-hidden": "true" },
          el("span", { id: "vocabProgressBar", style: "width:" + (tot ? known / tot * 100 : 0) + "%" }))));
    }

    view.appendChild(filterBar(rerender));

    var shown = 0;
    TIERS.forEach(function (t) {
      var rows = ordered.filter(function (e) {
        return e.tier === t.tier && (filter === null || e.cat === filter);
      });
      if (!rows.length) return;
      view.appendChild(el("h2", { class: "learn-track-head" }, t.label));
      rows.forEach(function (e) { view.appendChild(termRow(e)); shown++; });
    });
    if (!shown) view.appendChild(el("div", { class: "empty" }, el("p", {}, "No words in this topic.")));

    var aside = readingAside();
    if (aside) view.appendChild(el("div", { class: "vocab-aside-wrap" }, aside));

    view.appendChild(el("p", { class: "learn-muted vocab-provenance" },
      "Frequencies counted over the official BAMF Gesamtfragenkatalog (all " + POOL + " questions). Each word links to the exact questions it appears in, rendered live from the verified catalogue."));

    EB.app.finish(scroll, navigate);
  }

  EB.vocab = {
    render: render,
    all: function () { return ordered; },
    ready: function () { return ordered.length > 0; }
  };
})();
