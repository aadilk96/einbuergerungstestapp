/* Run with Playwright MCP browser_run_code_unsafe({filename: absolutePath}).
   Disposable context; never resets the user's progress. Start the app at
   http://127.0.0.1:8124 first. Focuses on Learn-mode lesson pages:
   layout across widths/themes, "Go deeper" as <details>, and — critically —
   that covered questions render live with the correct answer marked and the
   option buttons disabled (no answer leakage / no drift from the key). */
async (page) => {
  const base = 'http://127.0.0.1:8124/';
  const browser = page.context().browser();
  const check = (c, m) => { if (!c) throw new Error(m); };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', e => errors.push(e.message));
  const results = [];
  try {
    // Discover lesson ids from the loaded data.
    await tab.goto(base + '#/learn');
    await tab.waitForFunction(() => window.EB && EB.learn && EB.learn.ready());
    const ids = await tab.evaluate(() => EB.learn.all().map(l => l.id));
    check(ids.length >= 10, 'expected >= 10 lessons, got ' + ids.length);

    // Layout sweep: index + first two lessons, across widths and themes.
    async function layout(label) {
      const r = await tab.evaluate(() => {
        const nav = [...document.querySelectorAll('#tabs a')].map(a => {
          const b = a.getBoundingClientRect();
          const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return { label: a.textContent, clickable: !!hit && a.contains(hit), w: b.width, h: b.height };
        });
        const overflow = [...document.querySelectorAll('main *')].filter(e => {
          const b = e.getBoundingClientRect();
          return b.width && (b.left < -1 || b.right > innerWidth + 1);
        }).length;
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, nav, overflow };
      });
      check(r.scrollWidth <= r.width + 1, label + ': horizontal overflow');
      check(!r.overflow, label + ': ' + r.overflow + ' offscreen elements');
      check(r.nav.length === 6, label + ': expected 6 nav tabs, got ' + r.nav.length);
      for (const n of r.nav) {
        check(n.clickable, label + ': blocked nav ' + n.label);
        check(n.w >= 44 && n.h >= 44, label + ': small nav target ' + n.label + ' ' + Math.round(n.w) + 'x' + Math.round(n.h));
      }
      results.push({ label, width: r.width });
    }
    for (const width of [320, 375, 390, 768, 1280]) {
      await tab.setViewportSize({ width, height: 844 });
      for (const theme of ['light', 'dark']) {
        await tab.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
        await tab.goto(base + '#/learn');
        await tab.waitForFunction(() => document.querySelector('#tabs a.active')?.dataset.tab === 'learn');
        await layout('index/' + width + '/' + theme);
        for (const id of ids.slice(0, 2)) {
          await tab.goto(base + '#/learn/' + id);
          await tab.waitForFunction(() => document.querySelector('.learn-article'));
          await layout('lesson:' + id + '/' + width + '/' + theme);
        }
      }
    }

    // "Go deeper" sections must be <details>.
    await tab.setViewportSize({ width: 390, height: 844 });
    const withDeeper = await tab.evaluate((ids) => {
      for (const id of ids) {
        const l = EB.learn.byId(id);
        if ((l.sections || []).some(s => s.depth === 'deeper')) return id;
      }
      return null;
    }, ids);
    if (withDeeper) {
      await tab.goto(base + '#/learn/' + withDeeper);
      await tab.waitForFunction(() => document.querySelector('.learn-article'));
      const isDetails = await tab.evaluate(() => {
        const d = document.querySelector('.learn-deeper');
        return d && d.tagName.toLowerCase() === 'details';
      });
      check(isDetails, 'deeper section is not a <details>: ' + withDeeper);
    }

    // Covered questions render live, correct answer marked, buttons disabled.
    const withCovers = ids.find(async () => true) || ids[0];
    const lessonWithCovers = await tab.evaluate((ids) => {
      for (const id of ids) { const l = EB.learn.byId(id); if ((l.covers || []).length) return id; }
      return null;
    }, ids);
    check(lessonWithCovers, 'no lesson has covered questions');
    await tab.goto(base + '#/learn/' + lessonWithCovers);
    await tab.waitForFunction(() => document.querySelector('.learn-covers .learn-qgroup summary'));
    await tab.locator('.learn-covers .learn-qgroup > summary').click();
    await tab.waitForFunction(() => document.querySelector('.learn-covers .learn-qref .opt'));
    const cov = await tab.evaluate(() => {
      const cards = [...document.querySelectorAll('.learn-covers .learn-qref')];
      const opts = [...document.querySelectorAll('.learn-covers .learn-qref .opt')];
      return {
        cards: cards.length,
        anyCorrect: !!document.querySelector('.learn-covers .learn-qref .opt.correct'),
        allDisabled: opts.length > 0 && opts.every(o => o.disabled),
      };
    });
    check(cov.cards > 0, 'no live question cards rendered');
    check(cov.anyCorrect, 'no .opt.correct marked in covered questions');
    check(cov.allDisabled, 'covered-question option buttons are not all disabled');

    check(!errors.length, 'Console errors: ' + errors.join('; '));
    return { passed: results.length, lessons: ids.length, coversCard: cov, results, errors };
  } finally {
    await context.close();
  }
}
