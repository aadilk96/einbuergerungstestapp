/* Extended UI acceptance in disposable contexts. Run through Playwright MCP. */
async (page, { fileUrl = page.url().startsWith('file:') ? page.url() : '' } = {}) => {
  if (!fileUrl || new URL(fileUrl).protocol !== 'file:') {
    throw new Error('Pass { fileUrl } for app/index.html, or open that local file in page first.');
  }
  const localApp = new URL(fileUrl);
  localApp.hash = '/browse';
  const context = await page.context().browser().newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
  const tab = await context.newPage(), errors = [], results = [];
  tab.on('pageerror', e => errors.push(e.message));
  const check = (ok, why) => { if (!ok) throw Error(why); };
  async function mode(name) {
    await tab.getByRole('link', { name, exact: true }).click();
    await tab.waitForFunction(name => document.querySelector('#tabs a.active')?.dataset.tab === name.toLowerCase(), name);
  }
  async function bounds(label) {
    check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ': overflow');
    results.push(label);
  }
  async function questionVisible() {
    check(await tab.evaluate(() => {
      const q = document.querySelector('main .qtext').getBoundingClientRect();
      const header = document.querySelector('.exam-head') || document.querySelector('.topbar');
      return q.top >= header.getBoundingClientRect().bottom - 1 && q.top < innerHeight - 64;
    }), 'Question heading obscured after navigation');
  }
  try {
    await tab.goto('http://127.0.0.1:8124/#/browse');
    await tab.waitForSelector('main .qtext');
    await tab.locator('.skip-link').focus();
    await tab.keyboard.press('Enter');
    check(await tab.evaluate(() => document.activeElement.id === 'view' && location.hash === '#/browse'), 'Skip link changed route or failed to focus main');
    await tab.locator('#langToggle').click();
    await tab.getByRole('button', { name: 'Next', exact: true }).click();
    await questionVisible();
    await tab.locator('.explanation-disclosure summary').click();
    await tab.waitForSelector('.explanation-disclosure[open]');
    check(await tab.evaluate(() => document.querySelector('.study-actions').compareDocumentPosition(document.querySelector('.explanation-disclosure')) & Node.DOCUMENT_POSITION_FOLLOWING), 'Explanation precedes navigation');
    await bounds('Expanded bilingual Browse at 320px');
    const longId = await tab.evaluate(() => EB.data.all().reduce((a, b) => b.question_de.length + b.question_en.length > a.question_de.length + a.question_en.length ? b : a).id);
    await tab.getByRole('spinbutton').fill(String(longId));
    await tab.getByRole('spinbutton').press('Enter');
    await tab.getByRole('spinbutton').blur();
    await bounds('Longest bilingual question');
    await tab.getByRole('button', { name: /Star question/ }).click();
    await mode('Focus');
    await tab.locator('.opt').first().click();
    await tab.locator('.explanation-disclosure summary').click();
    await bounds('Populated Focus with expanded explanation');
    await mode('Exam');
    await tab.getByRole('button', { name: 'Start exam', exact: true }).click();
    await tab.locator('.opt').nth(0).click();
    await tab.locator('.opt').nth(1).click();
    check(await tab.locator('.opt').nth(1).getAttribute('aria-pressed') === 'true', 'Cannot change exam answer');
    check(await tab.locator('.opt.correct,.opt.wrong,.explanation-disclosure').count() === 0, 'Active exam leaks correctness');
    await tab.locator('.exam-navigator summary').click();
    await tab.getByRole('button', { name: 'Question 33, unanswered', exact: true }).click();
    await questionVisible();
    check(await tab.getByRole('button', { name: 'Next', exact: true }).isDisabled(), 'Last question Next remains enabled');
    await bounds('Active exam/navigator at 320px');
    await tab.addStyleTag({ content: 'body { font-size:24px } .qtext { font-size:28px } .opt .oen { font-size:21px } .exam-progress { font-size:20px } .btn { font-size:24px }' });
    await tab.getByRole('button', { name: 'Previous', exact: true }).click();
    await questionVisible();
    await bounds('Enlarged reading/control text and wrapped exam header');
    tab.once('dialog', d => d.accept());
    await tab.getByRole('button', { name: 'Submit', exact: true }).click();
    await tab.waitForSelector('.result-hero');
    await tab.locator('.explanation-disclosure summary').click();
    await bounds('Expanded paginated exam review');
    await mode('Stats');
    check(await tab.locator('.history-row').count() === 1, 'Missing history');
    await bounds('Populated Stats');
    await tab.setViewportSize({ width: 844, height: 390 });
    await bounds('Populated Stats landscape');
    await tab.goto(localApp.href);
    await tab.waitForSelector('main .qtext');
    check(await tab.evaluate(() => EB.data.all().length) === 310, 'file:// catalogue failed');
    await tab.getByRole('spinbutton').fill('226');
    await tab.getByRole('spinbutton').press('Enter');
    await tab.getByRole('spinbutton').blur();
    await tab.waitForFunction(() => document.querySelectorAll('main img').length === 4);
    for (const image of await tab.locator('main img').all()) await image.evaluate(i => i.decode());
    const link = tab.locator('main .image-link').first();
    const popupEvent = tab.waitForEvent('popup');
    await link.click();
    const popup = await popupEvent;
    await popup.waitForLoadState();
    check(popup.url().includes('/assets/img/q226-'), 'Full-size link failed');
    await popup.close();
    await bounds('file:// data and all four option images/full-size link');
    check(!errors.length, errors.join('; '));
    return { passed: results.length, results, errors };
  } finally { await context.close(); }
}
