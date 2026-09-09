/* Run with Playwright MCP browser_run_code_unsafe({filename: absolutePath}).
   Uses disposable contexts; never resets the user's browser progress.
   Start the app at http://127.0.0.1:8124 before running. */
async (page) => {
  const base = 'http://127.0.0.1:8124/';
  const browser = page.context().browser();
  const results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const imageIds = [21, 55, 70, 130, 176, 181, 187, 209, 216, 226, 235, 301, 308];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', e => errors.push(e.message));
  async function go(mode) {
    await tab.goto(base + '#/' + mode);
    await tab.waitForFunction(mode => window.EB && EB.app && document.querySelector('main').children.length &&
      (mode === 'home' ? !!document.querySelector('main .hero') : document.querySelector('#tabs a.active')?.dataset.tab === mode), mode);
  }
  async function layout(label) {
    const result = await tab.evaluate(() => {
      const nav = [...document.querySelectorAll('#tabs a')].map(a => {
        const r = a.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { label: a.textContent, clickable: !!hit && a.contains(hit), width: r.width, height: r.height };
      });
      const overflow = [...document.querySelectorAll('main button,main input,main a')].filter(e => {
        const r = e.getBoundingClientRect();
        return r.width && (r.left < -1 || r.right > innerWidth + 1);
      }).map(e => e.textContent.trim());
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, nav, overflow };
    });
    check(result.scrollWidth <= result.width + 1, label + ': horizontal overflow');
    check(!result.overflow.length, label + ': offscreen controls ' + result.overflow.join(','));
    for (const n of result.nav) {
      check(n.clickable, label + ': blocked nav ' + n.label);
      check(n.width >= 44 && n.height >= 44, label + ': small nav target ' + n.label);
    }
    results.push({ label, width: result.width, passed: true });
  }
  try {
    for (const width of [320, 375, 390, 430, 768, 1280]) {
      await tab.setViewportSize({ width, height: 844 });
      for (const theme of ['light', 'dark']) {
        for (const mode of ['home', 'browse', 'quiz', 'exam', 'focus', 'stats']) {
          await go(mode);
          await tab.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
          await layout(mode + '/' + theme);
        }
      }
    }
    await tab.setViewportSize({ width: 390, height: 844 });
    await go('browse');
    for (const id of imageIds) {
      await tab.getByRole('spinbutton').fill(String(id));
      await tab.getByRole('spinbutton').press('Enter');
      await tab.getByRole('spinbutton').blur();
      await tab.waitForFunction(id => {
        const q = EB.data.byId(id);
        return document.querySelector('main').textContent.includes(q.question_de);
      }, id);
      const images = tab.locator('main img');
      check(await images.count() > 0, 'Missing image at question ' + id);
      for (const img of await images.all()) {
        await img.evaluate(i => i.decode());
        check(await img.evaluate(i => i.naturalWidth > 0), 'Image decode ' + id);
      }
      await layout('image-' + id);
    }
    await tab.setViewportSize({ width: 844, height: 390 });
    await layout('landscape');
    check(!errors.length, 'Console errors: ' + errors.join('; '));
    return { passed: results.length, results, errors };
  } finally {
    await context.close();
  }
}
