/* ui.js — DOM helpers + reusable question-card parts. Global: EB.ui */
window.EB = window.EB || {};
(function () {
  var LETTERS = ["A", "B", "C", "D"];

  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null) e.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
      else e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function langEN() { return EB.store.settings().lang === "en"; }

  function fullSizeLink(src, label) {
    return el("a", { class: "image-link", href: src, target: "_blank", rel: "noopener noreferrer" },
      label, el("span", { class: "sr-only" }, " (opens in a new tab)"));
  }

  function qImage(q) {
    if (q.image_kind === "stem" && q.question_image) {
      return el("figure", { class: "qimg" },
        el("div", { class: "image-frame" }, el("img", {
          src: q.question_image, alt: "Illustration for question " + q.id_str, loading: "eager"
        })),
        el("figcaption", {}, fullSizeLink(q.question_image, "Open full-size image")));
    }
    return null;
  }

  function metaRow(q, onStar) {
    var pill = el("span", { class: "pill" + (q.category === "berlin" ? " berlin" : "") },
      q.category === "berlin" ? "Berlin · " + q.id_str : "Frage " + q.id_str);
    var starred = EB.store.isStarred(q.id);
    var star = el("button", {
      class: "star-btn" + (starred ? " on" : ""), type: "button",
      title: "Star this question", "aria-label": "Star question " + q.id_str,
      "aria-pressed": String(starred)
    }, el("span", { "aria-hidden": "true" }, "★"));
    star.addEventListener("click", function () {
      var on = EB.store.toggleStar(q.id);
      star.classList.toggle("on", on);
      star.setAttribute("aria-pressed", String(on));
      if (onStar) onStar(on);
    });
    return el("div", { class: "qmeta" }, pill, el("span", { class: "spacer" }), star);
  }

  function questionText(q) {
    var de = el("h2", { class: "qtext", tabindex: "-1", lang: "de", text: q.question_de });
    var frag = document.createDocumentFragment();
    frag.appendChild(de);
    if (langEN() && q.question_en) frag.appendChild(el("div", { class: "qtext en", lang: "en", text: q.question_en }));
    return frag;
  }

  // options container. opts: {interactive, revealed, chosen (index|null), onPick(i)}
  function optionsList(q, opts) {
    opts = opts || {};
    var wrap = el("div", { class: "options" });
    var imageLinks = el("div", { class: "option-image-links", "aria-label": "Full-size option images" });
    q.options.forEach(function (o, i) {
      var chosen = opts.chosen === i;
      var cls = "opt";
      var status = chosen ? "Selected" : "";
      if (opts.revealed) {
        if (i === q.correct_index) {
          cls += " correct";
          status = chosen ? "Selected · Correct answer" : "Correct answer";
        } else if (chosen) {
          cls += " wrong";
          status = "Selected · Incorrect answer";
        }
      }
      if (chosen) cls += " chosen";
      var marker = el("span", { class: "marker" }, LETTERS[i]);
      var otext = el("span", { class: "otext" }, el("span", { lang: "de" }, o.text_de));
      if (langEN() && o.text_en) otext.appendChild(el("span", { class: "oen", lang: "en", text: o.text_en }));
      if (q.image_kind === "options" && o.image) {
        otext.appendChild(el("span", { class: "oimg" }, el("img", {
          src: o.image, alt: "Image for option " + LETTERS[i], loading: "eager"
        })));
        imageLinks.appendChild(fullSizeLink(o.image, "Open image " + LETTERS[i] + " full size"));
      }
      if (status) otext.appendChild(el("span", { class: "option-status", lang: "en", text: status }));
      var btn = el("button", { class: cls, type: "button", "aria-pressed": String(chosen) }, marker, otext);
      if (opts.interactive && !opts.revealed) {
        btn.addEventListener("click", function () { if (opts.onPick) opts.onPick(i); });
      } else {
        btn.disabled = true;
      }
      wrap.appendChild(btn);
    });
    // Keep the four option buttons first and in source order; links are never inside them.
    if (imageLinks.firstChild) wrap.appendChild(imageLinks);
    return wrap;
  }

  function explainPanel(q) {
    var p = el("div", { class: "explain", lang: "en" });
    if (q.question_en) {
      p.appendChild(el("h3", {}, "In English"));
      p.appendChild(el("p", { text: q.question_en }));
    }
    if (q.asking_note) {
      p.appendChild(el("h3", {}, "What it's really asking"));
      p.appendChild(el("p", { text: q.asking_note }));
    }
    var correct = q.options[q.correct_index];
    var whyText = q.answer_explanation || "";
    var whyLead = "Correct: " + LETTERS[q.correct_index] + ". ";
    p.appendChild(el("h3", {}, "Why this is the answer"));
    p.appendChild(el("div", { class: "why" },
      el("p", {}, whyLead,
        el("span", { lang: "de", text: correct ? correct.text_de : "" }),
        correct && correct.text_en ? " (" + correct.text_en + ")" : null),
      whyText ? el("p", { text: whyText }) : null));
    if (q.distractor_notes && q.distractor_notes.some(function (d) { return d && d.trim(); })) {
      p.appendChild(el("h3", { class: "distractors-title" }, "The other options"));
      var ul = el("ul", { class: "distractors" });
      q.distractor_notes.forEach(function (d, i) {
        if (i === q.correct_index || !d || !d.trim()) return;
        ul.appendChild(el("li", {}, el("b", {}, LETTERS[i] + ": "), d));
      });
      p.appendChild(ul);
    }
    return p;
  }

  function disclosure(q, opts) {
    opts = opts || {};
    var open = !!opts.open;
    var details = el("details", { class: "explanation-disclosure", open: open });
    details.appendChild(el("summary", { lang: "en" }, "Explain in English"));
    var panel = explainPanel(q);
    panel.classList.add("open");
    details.appendChild(panel);
    details.addEventListener("toggle", function () {
      // Setting the initial open attribute also queues a native toggle event.
      if (details.open === open) return;
      open = details.open;
      if (opts.onToggle) opts.onToggle(open);
    });
    return details;
  }

  EB.ui = {
    el: el, clear: clear, LETTERS: LETTERS, langEN: langEN,
    qImage: qImage, metaRow: metaRow, questionText: questionText,
    optionsList: optionsList, explainPanel: explainPanel, disclosure: disclosure
  };
})();
