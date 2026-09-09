const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../app');
function storage(initial = {}, denied = false) {
  const values = new Map(Object.entries(initial));
  return { getItem(k) { if (denied) throw Error('denied'); return values.get(k) || null; },
    setItem(k, v) { if (denied) throw Error('denied'); values.set(k, v); },
    removeItem(k) { if (denied) throw Error('denied'); values.delete(k); } };
}
function app(local = storage(), session = storage()) {
  const ctx = vm.createContext({ localStorage: local, sessionStorage: session, Date, console });
  ctx.window = ctx;
  for (const file of ['data/questions.js', 'js/store.js', 'js/data.js', 'js/session.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  }
  return ctx.EB;
}
const plain = v => JSON.parse(JSON.stringify(v));
test('Unseen snapshot visits adjacent questions and preserves reveal state', () => {
  const e = app(); e.store.markSeen(1);
  const round = e.session.restart('browse', { unseen: true });
  assert.equal(e.session.current('browse').id, 2);
  e.store.markSeen(2); e.session.reveal('browse', true); e.session.disclosure('browse', true);
  e.store.setSetting('lang', 'en');
  assert.equal(e.session.current('browse').id, 2);
  assert.equal(e.session.questionState('browse').disclosure, true);
  e.session.move('browse', 1);
  assert.equal(e.session.current('browse').id, 3);
  assert.equal(round.ids.length, 309);
});
test('Quiz counts one answer and Focus has independent state', () => {
  const e = app(), round = e.session.study('quiz'), q = e.session.current('quiz');
  assert.equal(e.session.answer('quiz', q.correct_index), true);
  e.store.setSetting('lang', 'en'); e.session.study('focus');
  assert.equal(e.session.study('quiz'), round);
  assert.equal(e.session.answer('quiz', q.correct_index), false);
  assert.equal(round.done, 1); assert.equal(round.right, 1);
  const next = e.session.restart('quiz', { category: 'berlin' });
  assert.equal(next.ids.length, 10); assert.equal(next.done, 0);
});
test('Normalize corrupt fields without losing valid progress', () => {
  for (const invalid of ['null', '[]', '42', 'broken']) assert.doesNotThrow(() => app(storage({ eb_state_v1: invalid })).store.stats([1]));
  const e = app(storage({ eb_state_v1: JSON.stringify({ seen: null, correct: { 2: 4, 3: -1 }, starred: { 1: true, 400: true }, last: { 2: 'right' }, settings: { lang: 'en' }, exams: {} }) }));
  assert.equal(e.store.isStarred(1), true); assert.equal(e.store.isStarred(400), false);
  assert.equal(e.store.get().correct[2], 4); assert.equal(e.store.get().correct[3], undefined);
  assert.equal(e.store.lastResult(2), 'right'); assert.equal(e.store.settings().lang, 'en');
  assert.equal(e.store.exams().length, 0);
});
test('Exam sampling has 33 unique IDs and does not mutate catalogue', () => {
  const e = app(), before = plain(e.data.ids());
  for (let i = 0; i < 30; i++) {
    const qs = e.data.sampleExam();
    assert.equal(new Set(qs.map(q => q.id)).size, 33);
    assert.equal(qs.filter(q => q.exam_pool === 'general').length, 30);
    assert.equal(qs.filter(q => q.exam_pool === 'berlin').length, 3);
  }
  assert.deepEqual(plain(e.data.ids()), before);
});
test('Exam choice zero/index survive reload and submission is idempotent', () => {
  const local = storage(), sess = storage(); let e = app(local, sess);
  let s = e.session.startExam(); e.session.chooseExam(0); e.session.moveExam(3);
  const first = s.ids[0];
  e = app(local, sess); s = e.session.exam();
  assert.equal(s.answers[first], 0); assert.equal(s.idx, 3);
  assert.equal(e.session.submitExam(), true); assert.equal(e.session.submitExam(), false);
  assert.equal(e.store.exams().length, 1);
  e = app(local, sess); assert.equal(e.session.exam().submitted, true);
  assert.equal(e.session.submitExam(), false); assert.equal(e.store.exams().length, 1);
});
test('Exam pass boundary and unanswered grading', () => {
  for (const count of [0, 16, 17, 33]) {
    const e = app(), s = e.session.startExam();
    for (let i = 0; i < count; i++) { e.session.moveExam(i); e.session.chooseExam(e.data.byId(s.ids[i]).correct_index); }
    e.session.submitExam(s.start + 61000);
    assert.equal(s.score, count); assert.equal(s.passed, count >= 17); assert.equal(s.durationSec, 61);
  }
});
test('Expired session cannot accept choices and records once', () => {
  const e = app(), s = e.session.startExam(); s.start -= 3605000;
  assert.equal(e.session.remaining(), 0); assert.equal(e.session.chooseExam(0), false);
  assert.equal(e.session.submitExam(), true); assert.equal(e.session.submitExam(), false);
  assert.equal(s.durationSec, 3600); assert.equal(e.store.exams().length, 1);
});
test('Invalid saved exam IDs are rejected; legacy submitted exam is not regraded', () => {
  const base = app(), valid = plain(base.session.startExam());
  for (const bad of [null, {}, { ...valid, ids: [99999] }, { ...valid, duration: 10 }, { ...valid, ids: Array(33).fill(1) }]) {
    assert.equal(app(storage(), storage({ eb_exam_session_v1: JSON.stringify(bad) })).session.exam(), null);
  }
  const old = { ...valid, submitted: true, score: 20, passed: true, durationSec: 600 };
  const e = app(storage(), storage({ eb_exam_session_v1: JSON.stringify(old) }));
  assert.equal(e.session.exam().score, 20); assert.equal(e.session.submitExam(), false); assert.equal(e.store.exams().length, 0);
});
test('Denied storage keeps usable in-memory progress and exam', () => {
  const e = app(storage({}, true), storage({}, true));
  e.store.recordAnswer(1, true); assert.equal(e.store.lastResult(1), 'right');
  const s = e.session.startExam(); assert.ok(s); e.session.chooseExam(0);
  assert.equal(e.session.exam(), s); assert.equal(s.answers[s.ids[0]], 0);
  assert.equal(e.store.storageAvailable(), false); assert.equal(e.session.storageAvailable(), false);
});
