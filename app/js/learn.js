/* learn.js — "Learn" mode: long-form lessons that explain the reasoning behind the
   answers. Data from window.LESSONS. Renders WITHOUT innerHTML (authored content is
   passed through EB.ui.el, which wraps strings in text nodes). Global: EB.learn.

   A lesson never restates the answer key: tested facts are rendered live from
   window.QUESTIONS via referenceCard(), so lesson prose can never drift from the
   verified answers. See HANDOFF.md and js/learn schema notes below. */
window.EB = window.EB || {};
(function () {
  var ui = EB.ui, el = ui.el;
  var raw = window.LESSONS || { version: 0, tracks: [], lessons: [] };
  var TRACKS = Array.isArray(raw.tracks) ? raw.tracks : [];
  var LESSONS = Array.isArray(raw.lessons) ? raw.lessons : [];

  var byId = {};
  LESSONS.forEach(function (l) { byId[l.id] = l; });

  // Lessons in stable display order: by track order, then by lesson.order (fallback array order).
  var trackOrder = {};
  TRACKS.forEach(function (t, i) { trackOrder[t.id] = i; });
  var ordered = LESSONS.slice().sort(function (a, b) {
    var ta = trackOrder[a.track] == null ? 99 : trackOrder[a.track];
    var tb = trackOrder[b.track] == null ? 99 : trackOrder[b.track];
    if (ta !== tb) return ta - tb;
    var oa = typeof a.order === "number" ? a.order : 0, ob = typeof b.order === "number" ? b.order : 0;
    return oa - ob;
  });

  /* ---------- inline emphasis: **bold** *italic* `code` → nodes (no innerHTML) ---------- */
  function renderInline(text) {
    var out = [], s = String(text == null ? "" : text);
    var re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g, last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      if (m[1] != null) out.push(el("strong", {}, m[1]));
      else if (m[2] != null) out.push(el("em", {}, m[2]));
      else if (m[3] != null) out.push(el("code", {}, m[3]));
      last = re.lastIndex;
    }
    if (last < s.length) out.push(s.slice(last));
    return out; // el() flattens arrays of nodes/strings
  }

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

  // A collapsible group of live question cards; builds cards lazily on first open.
  function questionGroup(ids, summaryLabel, open) {
    var list = (ids || []).map(Number).filter(function (id) { return !!EB.data.byId(id); });
    var details = el("details", { class: "learn-qgroup" });
    if (open) details.open = true;
    var label = summaryLabel || ("Show the " + list.length + " question" + (list.length === 1 ? "" : "s") + " this explains");
    details.appendChild(el("summary", {}, label));
    var body = el("div", { class: "learn-qgroup-body" });
    details.appendChild(body);
    var built = false;
    function build() {
      if (built) return;
      built = true;
      if (!list.length) { body.appendChild(el("p", { class: "learn-muted" }, "No linked questions.")); return; }
      list.forEach(function (id) { var c = referenceCard(EB.data.byId(id)); if (c) body.appendChild(c); });
    }
    if (open) build();
    details.addEventListener("toggle", function () { if (details.open) build(); });
    return details;
  }

  /* ---------- block model ---------- */
  function renderBlock(b) {
    if (!b || typeof b !== "object") return null;
    switch (b.type) {
      case "paragraph":
        return el("p", { class: "learn-p" }, renderInline(b.text));
      case "subheading":
        return el("h4", { class: "learn-subhead" }, renderInline(b.text));
      case "list": {
        var tag = b.ordered ? "ol" : "ul";
        var wrap = el(tag, { class: "learn-list" });
        (b.items || []).forEach(function (it) { wrap.appendChild(el("li", {}, renderInline(it))); });
        return wrap;
      }
      case "note": {
        var tone = (b.tone === "warn" || b.tone === "key") ? b.tone : "info";
        var box = el("div", { class: "learn-note " + tone });
        if (b.title) box.appendChild(el("div", { class: "learn-note-title" }, renderInline(b.title)));
        box.appendChild(el("div", { class: "learn-note-body" }, renderInline(b.text)));
        return box;
      }
      case "timeline": {
        var tl = el("ol", { class: "learn-timeline" });
        (b.events || []).forEach(function (ev) {
          if (!ev) return;
          tl.appendChild(el("li", {},
            el("span", { class: "learn-tl-year" }, String(ev.year == null ? "" : ev.year)),
            el("span", { class: "learn-tl-text" }, renderInline(ev.text))));
        });
        return tl;
      }
      case "term":
        return el("div", { class: "learn-term" },
          el("dfn", { class: "learn-term-name" }, renderInline(b.term)),
          el("span", { class: "learn-term-def" }, renderInline(b.text)));
      case "quote":
        return el("figure", { class: "learn-quote" },
          el("blockquote", {}, renderInline(b.text)),
          b.cite ? el("figcaption", {}, renderInline(b.cite)) : null);
      case "questions": {
        var frag = document.createDocumentFragment();
        if (b.intro) frag.appendChild(el("p", { class: "learn-p learn-qintro" }, renderInline(b.intro)));
        frag.appendChild(questionGroup(b.ids, b.summary, b.open === true));
        return frag;
      }
      default:
        return null; // unknown block types ignored defensively
    }
  }
  function renderBlocks(blocks) {
    var frag = document.createDocumentFragment();
    (blocks || []).forEach(function (b) { var node = renderBlock(b); if (node) frag.appendChild(node); });
    return frag;
  }

  function trackTitle(id) {
    var t = TRACKS.filter(function (x) { return x.id === id; })[0];
    return t ? t.title : id;
  }
  function coversCount(l) { return Array.isArray(l.covers) ? l.covers.length : 0; }

  /* ---------- index view (#/learn) ---------- */
  function lessonCard(l, n) {
    var read = EB.store.isLessonRead && EB.store.isLessonRead(l.id);
    var card = el("a", { class: "learn-card" + (read ? " read" : ""), href: "#/learn/" + l.id });
    card.appendChild(el("div", { class: "learn-card-num" }, String(n)));
    var main = el("div", { class: "learn-card-main" });
    main.appendChild(el("h3", { class: "learn-card-title" }, l.title));
    if (l.summary) main.appendChild(el("div", { class: "learn-card-sum" }, l.summary));
    var meta = el("div", { class: "learn-card-meta" });
    if (l.minutes) meta.appendChild(el("span", {}, l.minutes + " min read"));
    meta.appendChild(el("span", {}, "explains " + coversCount(l) + " question" + (coversCount(l) === 1 ? "" : "s")));
    main.appendChild(meta);
    card.appendChild(main);
    if (read) card.appendChild(el("span", { class: "learn-read-tick", "aria-label": "Read" }, "✓"));
    return card;
  }

  function renderIndex(navigate) {
    EB.app.setActiveTab("learn");
    var scroll = EB.app.begin(), view = EB.app.view;
    view.appendChild(el("h1", { class: "section-title" }, "Learn"));
    view.appendChild(el("div", { class: "section-sub" },
      "Understand the reasoning behind the answers — German history, how the government is built, and why the Grundgesetz is written the way it is. Each lesson links to the exact exam questions it explains."));

    if (!ordered.length) {
      view.appendChild(el("div", { class: "empty" }, el("p", {}, "No lessons loaded. Keep data/lessons.js beside the app.")));
      EB.app.finish(scroll, navigate); return;
    }

    // progress
    if (EB.store.readLessonCount) {
      var readN = EB.store.readLessonCount(), tot = ordered.length;
      view.appendChild(el("div", { class: "qcard learn-progress" },
        el("div", { class: "stat-progress-label" }, el("span", {}, "Lessons read"), el("b", {}, readN + " / " + tot)),
        el("div", { class: "bar", "aria-hidden": "true" }, el("span", { style: "width:" + (tot ? readN / tot * 100 : 0) + "%" }))));
    }

    var n = 0, lastTrack = null;
    ordered.forEach(function (l) {
      if (l.track !== lastTrack) {
        lastTrack = l.track;
        view.appendChild(el("h2", { class: "learn-track-head" }, trackTitle(l.track)));
      }
      n++;
      view.appendChild(lessonCard(l, n));
    });
    EB.app.finish(scroll, navigate);
  }

  /* ---------- lesson view (#/learn/<id>) ---------- */
  function neighbors(id) {
    var i = ordered.findIndex(function (l) { return l.id === id; });
    return { prev: i > 0 ? ordered[i - 1] : null, next: i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null, idx: i };
  }

  function renderLesson(id, navigate) {
    EB.app.setActiveTab("learn");
    var scroll = EB.app.begin(), view = EB.app.view;
    var l = byId[id];
    view.appendChild(el("a", { class: "learn-back", href: "#/learn" }, "← All lessons"));
    if (!l) {
      view.appendChild(el("div", { class: "empty" }, el("p", {}, "Lesson not found.")));
      EB.app.finish(scroll, navigate, "section"); return;
    }

    var head = el("div", { class: "learn-lesson-head" });
    head.appendChild(el("span", { class: "pill" }, trackTitle(l.track)));
    head.appendChild(el("h1", { class: "learn-title", tabindex: "-1" }, l.title));
    if (l.summary) head.appendChild(el("p", { class: "learn-lesson-sum" }, l.summary));
    var meta = el("div", { class: "learn-lesson-meta" });
    if (l.minutes) meta.appendChild(el("span", {}, l.minutes + " min read"));
    meta.appendChild(el("span", {}, "explains " + coversCount(l) + " exam question" + (coversCount(l) === 1 ? "" : "s")));
    head.appendChild(meta);
    view.appendChild(head);

    var article = el("article", { class: "learn-article" });
    (l.sections || []).forEach(function (sec) {
      if (!sec) return;
      if (sec.depth === "deeper") {
        var d = el("details", { class: "learn-deeper" });
        d.appendChild(el("summary", {}, el("span", { class: "learn-deeper-label" }, "Go deeper"),
          el("span", { class: "learn-deeper-head" }, sec.heading || "")));
        var body = el("div", { class: "learn-deeper-body" });
        body.appendChild(renderBlocks(sec.blocks));
        d.appendChild(body);
        article.appendChild(d);
      } else {
        var s = el("section", { class: "learn-section" });
        if (sec.heading) s.appendChild(el("h3", { class: "learn-section-head" }, sec.heading));
        s.appendChild(renderBlocks(sec.blocks));
        article.appendChild(s);
      }
    });
    view.appendChild(article);

    // Sources / further reading
    if (Array.isArray(l.sources) && l.sources.length) {
      var src = el("section", { class: "learn-sources" });
      src.appendChild(el("h3", { class: "learn-section-head" }, "Sources & further reading"));
      var ul = el("ul", { class: "learn-list" });
      l.sources.forEach(function (s0) {
        if (!s0 || !s0.url) { if (s0 && s0.label) ul.appendChild(el("li", {}, s0.label)); return; }
        ul.appendChild(el("li", {}, el("a", { href: s0.url, target: "_blank", rel: "noopener noreferrer" }, s0.label || s0.url)));
      });
      src.appendChild(ul);
      view.appendChild(src);
    }

    // All covered questions (live, verified), lazy
    if (coversCount(l)) {
      var box = el("section", { class: "learn-covers" });
      box.appendChild(el("h3", { class: "learn-section-head" }, "Every exam question this lesson explains"));
      box.appendChild(el("p", { class: "learn-muted" }, "Answers come straight from the verified catalogue — this is what you'll be tested on."));
      box.appendChild(questionGroup(l.covers, "Show all " + coversCount(l) + " questions", false));
      view.appendChild(box);
    }

    // Mark read + prev/next
    var nb = neighbors(id);
    var actions = el("div", { class: "learn-lesson-actions" });
    if (EB.store.markLessonRead) {
      var isRead = EB.store.isLessonRead(l.id);
      var readBtn = EB.app.button(isRead ? "✓ Read — mark unread" : "Mark as read", function () {
        var now = !EB.store.isLessonRead(l.id);
        EB.store.markLessonRead(l.id, now);
        readBtn.textContent = now ? "✓ Read — mark unread" : "Mark as read";
        readBtn.classList.toggle("primary", !now);
        EB.app.storageWarning && EB.app.storageWarning();
      }, "btn" + (isRead ? "" : " primary"));
      actions.appendChild(readBtn);
    }
    var nav = el("div", { class: "learn-prevnext" });
    if (nb.prev) nav.appendChild(el("a", { class: "btn", href: "#/learn/" + nb.prev.id }, "← " + nb.prev.title));
    if (nb.next) nav.appendChild(el("a", { class: "btn primary", href: "#/learn/" + nb.next.id }, nb.next.title + " →"));
    actions.appendChild(nav);
    view.appendChild(actions);

    EB.app.finish(scroll, navigate, "section");
  }

  EB.learn = {
    renderIndex: renderIndex,
    renderLesson: renderLesson,
    all: function () { return ordered; },
    byId: function (id) { return byId[id]; },
    tracks: function () { return TRACKS; },
    renderBlocks: renderBlocks,
    renderInline: renderInline,
    ready: function () { return ordered.length > 0; }
  };
})();
