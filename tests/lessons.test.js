/* Integrity checks for the Learn-mode content (app/data/lessons.js).
   Content evolves, so this does NOT pin hashes — it enforces structure and the
   load-bearing accuracy invariant: every referenced question id exists in the
   verified catalogue, so lesson prose can never point at a non-existent answer. */
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
vm.runInNewContext(read('app/data/lessons.js').toString(), sandbox);
const QUESTIONS = sandbox.window.QUESTIONS;
const LESSONS = sandbox.window.LESSONS;
const validIds = new Set(QUESTIONS.questions.map(q => q.id));

const KNOWN_BLOCKS = {
  paragraph: b => typeof b.text === 'string' && b.text.trim(),
  subheading: b => typeof b.text === 'string' && b.text.trim(),
  list: b => Array.isArray(b.items) && b.items.length && b.items.every(i => typeof i === 'string'),
  note: b => typeof b.text === 'string' && b.text.trim() && (b.tone == null || ['info', 'warn', 'key'].includes(b.tone)),
  timeline: b => Array.isArray(b.events) && b.events.length && b.events.every(e => e && typeof e.text === 'string'),
  term: b => typeof b.term === 'string' && b.term.trim() && typeof b.text === 'string' && b.text.trim(),
  quote: b => typeof b.text === 'string' && b.text.trim(),
  questions: b => Array.isArray(b.ids) && b.ids.length && b.ids.every(id => Number.isInteger(id)),
};

test('window.LESSONS has the expected top-level shape', () => {
  assert.ok(LESSONS && typeof LESSONS === 'object', 'LESSONS missing');
  assert.ok(Array.isArray(LESSONS.tracks) && LESSONS.tracks.length >= 1, 'tracks');
  assert.ok(Array.isArray(LESSONS.lessons) && LESSONS.lessons.length >= 10, 'expected >= 10 lessons');
});

test('tracks are well-formed and unique', () => {
  const ids = LESSONS.tracks.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate track id');
  for (const t of LESSONS.tracks) {
    assert.ok(/^[a-z0-9-]+$/.test(t.id), `track id ${t.id}`);
    assert.ok(typeof t.title === 'string' && t.title.trim(), `track title ${t.id}`);
  }
});

test('every lesson is well-formed with a valid track and >=1 core section', () => {
  const trackIds = new Set(LESSONS.tracks.map(t => t.id));
  const slugs = LESSONS.lessons.map(l => l.id);
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate lesson id');
  for (const l of LESSONS.lessons) {
    assert.ok(/^[a-z0-9-]{1,64}$/.test(l.id), `lesson slug ${l.id}`);
    assert.ok(trackIds.has(l.track), `lesson ${l.id}: unknown track ${l.track}`);
    assert.ok(typeof l.title === 'string' && l.title.trim(), `lesson ${l.id}: title`);
    assert.ok(Array.isArray(l.sections) && l.sections.length, `lesson ${l.id}: sections`);
    let core = 0;
    for (const s of l.sections) {
      assert.ok(['core', 'deeper'].includes(s.depth), `lesson ${l.id}: section depth ${s.depth}`);
      if (s.depth === 'core') core++;
      assert.ok(Array.isArray(s.blocks) && s.blocks.length, `lesson ${l.id}: section blocks`);
    }
    assert.ok(core >= 1, `lesson ${l.id}: needs >=1 core section`);
    if (l.sources) {
      assert.ok(Array.isArray(l.sources), `lesson ${l.id}: sources array`);
      for (const src of l.sources) assert.ok(src && typeof src.label === 'string', `lesson ${l.id}: source label`);
    }
  }
});

test('every block has a known type with valid required fields', () => {
  for (const l of LESSONS.lessons) {
    for (const s of l.sections) {
      for (const b of s.blocks) {
        assert.ok(b && KNOWN_BLOCKS[b.type], `lesson ${l.id}: unknown block type ${b && b.type}`);
        assert.ok(KNOWN_BLOCKS[b.type](b), `lesson ${l.id}: malformed ${b.type} block`);
      }
    }
  }
});

test('ACCURACY INVARIANT: every referenced question id exists in the catalogue', () => {
  for (const l of LESSONS.lessons) {
    for (const id of (l.covers || [])) {
      assert.ok(validIds.has(id), `lesson ${l.id}: covers id ${id} not in catalogue`);
    }
    for (const s of l.sections) {
      for (const b of s.blocks) {
        if (b.type === 'questions') {
          for (const id of b.ids) assert.ok(validIds.has(id), `lesson ${l.id}: questions block id ${id} not in catalogue`);
        }
      }
    }
  }
});
