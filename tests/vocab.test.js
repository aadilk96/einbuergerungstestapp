/* Integrity checks for the Vocab-mode content (app/data/vocab.js).
   Content is derived from the catalogue and evolves, so this does NOT pin hashes — it
   enforces structure and the load-bearing accuracy invariant: every example question id
   exists in the verified catalogue, so a vocab entry can never point at a non-existent
   question, and its frequency counts stay bounded by the 310-question pool. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));

// Load both plain-script payloads into a sandbox (no DOM needed).
const sandbox = { window: {} };
vm.runInNewContext(read('app/data/questions.js').toString(), sandbox);
vm.runInNewContext(read('app/data/vocab.js').toString(), sandbox);
const QUESTIONS = sandbox.window.QUESTIONS;
const VOCAB = sandbox.window.VOCAB;
const validIds = new Set(QUESTIONS.questions.map(q => q.id));

test('window.VOCAB has the expected top-level shape', () => {
  assert.ok(VOCAB && typeof VOCAB === 'object', 'VOCAB missing');
  assert.ok(Array.isArray(VOCAB.entries) && VOCAB.entries.length >= 30, 'expected >= 30 entries');
  assert.ok(Array.isArray(VOCAB.categories) && VOCAB.categories.length >= 1, 'categories');
  assert.ok(Array.isArray(VOCAB.reading), 'reading array');
  assert.ok(Number.isInteger(VOCAB.pool) && VOCAB.pool > 0, 'pool');
});

test('categories are well-formed and unique', () => {
  const ids = VOCAB.categories.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate category id');
  for (const c of VOCAB.categories) {
    assert.ok(/^[A-Za-z0-9-]+$/.test(c.id), `category id ${c.id}`);
    assert.ok(typeof c.title === 'string' && c.title.trim(), `category title ${c.id}`);
  }
});

test('every entry is well-formed with a valid category and tier', () => {
  const catIds = new Set(VOCAB.categories.map(c => c.id));
  const slugs = VOCAB.entries.map(e => e.id);
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate entry id');
  const ranks = VOCAB.entries.map(e => e.rank);
  assert.equal(new Set(ranks).size, ranks.length, 'duplicate rank');
  for (const e of VOCAB.entries) {
    assert.ok(/^[a-z0-9-]{1,64}$/.test(e.id), `entry slug ${e.id}`);
    assert.ok(Number.isInteger(e.rank) && e.rank >= 1, `entry ${e.id}: rank`);
    assert.ok(typeof e.de === 'string' && e.de.trim(), `entry ${e.id}: de`);
    assert.ok(typeof e.en === 'string' && e.en.trim(), `entry ${e.id}: en`);
    assert.ok(catIds.has(e.cat), `entry ${e.id}: unknown category ${e.cat}`);
    assert.ok([1, 2, 3].includes(e.tier), `entry ${e.id}: tier ${e.tier}`);
    assert.ok(Number.isInteger(e.df) && e.df >= 1 && e.df <= VOCAB.pool, `entry ${e.id}: df ${e.df}`);
    assert.ok(Number.isInteger(e.cor) && e.cor >= 0 && e.cor <= e.df, `entry ${e.id}: cor ${e.cor} vs df ${e.df}`);
    assert.ok(Array.isArray(e.ex), `entry ${e.id}: ex array`);
  }
});

test('reading aside is well-formed', () => {
  for (const g of VOCAB.reading) {
    assert.ok(typeof g.label === 'string' && g.label.trim(), 'reading group label');
    assert.ok(Array.isArray(g.items) && g.items.length, 'reading group items');
    for (const it of g.items) {
      assert.ok(Array.isArray(it) && it.length === 2 && it.every(x => typeof x === 'string'), `reading item ${g.label}`);
    }
  }
});

test('ACCURACY INVARIANT: every example question id exists in the catalogue', () => {
  for (const e of VOCAB.entries) {
    for (const id of e.ex) {
      assert.ok(Number.isInteger(id) && validIds.has(id), `entry ${e.id}: example id ${id} not in catalogue`);
    }
  }
});
