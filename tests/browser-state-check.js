/* Run via Playwright MCP browser_run_code_unsafe filename. Disposable storage only. */
async (page) => {
  const browser = page.context().browser();
  const base = 'http://127.0.0.1:8124/';
  const results = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  async function scenario(name, run, setup) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', e => errors.push(e.message));
    try {
      if (setup) await tab.addInitScript(setup);
      await tab.goto(base);
      await tab.waitForFunction(() => window.EB && EB.app && document.querySelector('main').children.length);
      await run(tab);
      check(!errors.length, name + ': ' + errors.join('; '));
      results.push({ name, passed: true });
    } finally { await context.close(); }
  }
  async function mode(tab, name) {
    await tab.getByRole('link', { name, exact: true }).click();
    await tab.waitForFunction(name => document.querySelector('#tabs a.active')?.dataset.tab === name.toLowerCase(), name);
  }
  const question = tab => tab.locator('main .qtext').first().innerText();
  const toggleLanguage = tab => tab.locator('#langToggle').click();
  await scenario('Unseen navigation and language repaint', async tab => {
    await mode(tab, 'Browse');
    await tab.getByRole('button', { name: 'Unseen', exact: true }).click();
    const before = await question(tab);
    const id = await tab.evaluate(text => EB.data.all().find(q => q.question_de === text).id, before);
    await toggleLanguage(tab);
    check(await question(tab) === before, 'Language moved unseen question');
    await tab.getByRole('button', { name: /Next/ }).click();
    const next = await tab.evaluate(id => EB.data.byId(id + 1).question_de, id);
    check(await question(tab) === next, 'Next skipped an unseen question');
  });
  await scenario('Quiz answer is counted once across language and mode changes', async tab => {
    await mode(tab, 'Quiz');
    const text = await question(tab);
    await tab.locator('main .options button.opt').first().click();
    const before = await tab.evaluate(() => JSON.stringify(EB.store.get()));
    await toggleLanguage(tab);
    check(await question(tab) === text, 'Quiz question changed');
    check(await tab.locator('main .options button.opt:disabled').count() === 4, 'Answered quiz unlocked');
    check(await tab.evaluate(() => JSON.stringify(EB.store.get().correct)) === JSON.stringify(JSON.parse(before).correct), 'Correct count changed');
    check(await tab.evaluate(() => JSON.stringify(EB.store.get().wrong)) === JSON.stringify(JSON.parse(before).wrong), 'Wrong count changed');
    await mode(tab, 'Focus');
    await mode(tab, 'Quiz');
    check(await question(tab) === text, 'Quiz round lost after Focus');
    check(await tab.locator('main .options button.opt:disabled').count() === 4, 'Mode switch unlocked answer');
  });
  await scenario('Exam choice and index survive reload with no early answer disclosure', async tab => {
    await mode(tab, 'Exam');
    await tab.getByRole('button', { name: 'Start exam', exact: true }).click();
    check(await tab.locator('main .qcard').count() === 1, 'Exam renders more than one question');
    check(await tab.locator('main .opt.correct,main .opt.wrong').count() === 0, 'Exam leaks answer');
    await tab.locator('main .options button.opt').first().click();
    await tab.getByRole('button', { name: /Next/ }).click();
    const second = await question(tab);
    await tab.reload();
    await tab.waitForFunction(() => document.querySelector('main .qtext'));
    check(await question(tab) === second, 'Exam position lost after reload');
    await tab.getByRole('button', { name: /Prev/ }).click();
    check(await tab.locator('main .options button.opt.chosen').count() === 1, 'Exam selection lost');
    tab.once('dialog', d => d.dismiss());
    await tab.getByRole('button', { name: /Submit/ }).click();
    check(await tab.locator('main .timer').count() === 1, 'Cancel submitted exam');
    tab.once('dialog', d => d.accept());
    await tab.getByRole('button', { name: /Submit/ }).click();
    await tab.waitForFunction(() => EB.store.exams().length === 1);
    await tab.reload();
    await tab.waitForFunction(() => document.querySelector('main .result-hero'));
    check(await tab.evaluate(() => EB.store.exams().length) === 1, 'Reload duplicated exam history');
    check(await tab.locator('main .qcard').count() === 1, 'Review renders more than one question');
  });
  await scenario('Expired exam records once and leaves no interval', async tab => {
    await tab.evaluate(() => {
      sessionStorage.setItem('eb_exam_session_v1', JSON.stringify({ ids: EB.data.sampleExam().map(q => q.id), answers: {}, idx: 0, start: Date.now() - 3605000, duration: 3600, submitted: false }));
    });
    await tab.addInitScript(() => {
      const originalSet = window.setInterval, originalClear = window.clearInterval;
      window.testIntervals = new Set();
      window.setInterval = function (...args) { const id = originalSet(...args); testIntervals.add(id); return id; };
      window.clearInterval = function (id) { testIntervals.delete(id); return originalClear(id); };
    });
    await tab.evaluate(() => history.replaceState(null, '', '#/exam'));
    await tab.reload();
    await tab.waitForFunction(() => EB.store.exams().length === 1);
    check(await tab.evaluate(() => testIntervals.size) === 0, 'Expired session left an interval');
    await toggleLanguage(tab);
    check(await tab.evaluate(() => EB.store.exams().length) === 1, 'Language regraded expired session');
  });
  await scenario('Malformed progress and invalid exam recover', async tab => {
    await tab.evaluate(() => {
      localStorage.setItem('eb_state_v1', '{"seen":null,"starred":{"1":true}}');
      sessionStorage.setItem('eb_exam_session_v1', '{"ids":[99999],"answers":{},"start":1}');
    });
    await tab.reload();
    await tab.waitForFunction(() => window.EB && EB.store);
    check(await tab.evaluate(() => EB.store.isStarred(1)), 'Valid stars lost during recovery');
    await mode(tab, 'Exam');
    check(await tab.getByRole('button', { name: 'Start exam', exact: true }).count() === 1, 'Invalid exam not recoverable');
  });
  await scenario('Denied storage keeps an in-memory exam', async tab => {
    await mode(tab, 'Exam');
    await tab.getByRole('button', { name: 'Start exam', exact: true }).click();
    const text = await question(tab);
    await tab.locator('main .options button.opt').first().click();
    await toggleLanguage(tab);
    check(await question(tab) === text, 'Denied storage discarded exam');
    check(await tab.locator('main .opt.chosen').count() === 1, 'Denied storage lost answer');
    check(await tab.locator('.storage-warning').count() > 0, 'No persistence warning');
  }, () => {
    for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Test denial', 'SecurityError'); } });
  });
  return { passed: results.length, results };
}
