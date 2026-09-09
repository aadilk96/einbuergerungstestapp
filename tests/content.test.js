/* Refactor guard: verifies preservation, not a fresh official-source audit. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const core = JSON.parse(read('pipeline/questions.core.json'));
const data = JSON.parse(read('app/data/questions.json'));

test('verified payloads remain byte-identical to the pre-cleanup baseline', () => {
  const hashes = {
    'pipeline/questions.core.json': 'b2af4880c94a202460d43f517320accc819bcea44690a6da917f189ca9e5f36d',
    'app/data/questions.js': 'c7a76affe208bed9c684a8fe1382c469c6e914746305223549736413c062d6a9',
    'app/data/questions.json': '4f9e82ba35df4276ad7cf7d8449d8e778fbb31717399ffec43884061fb66ff02'
  };
  for (const [file, hash] of Object.entries(hashes)) assert.equal(sha(read(file)), hash, file);
});

test('all original question image bytes and paths are unchanged', () => {
  const files = fs.readdirSync(path.join(root, 'app/assets/img')).sort();
  assert.equal(files.length, 25);
  const parts = files.flatMap(name => {
    const file = 'app/assets/img/' + name;
    return [Buffer.from(file + '\0'), read(file)];
  });
  assert.equal(sha(Buffer.concat(parts)), 'c6317e70788b23914dbe0680192633737ccdda454dcc1dad527cc48d3e3af6b0');
});

test('plain-script payload equals JSON reference and retains all source fields', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read('app/data/questions.js').toString(), sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.QUESTIONS)), data);
  assert.equal(data.questions.length, 310);
  assert.deepEqual(data.questions.map(q => q.id), Array.from({ length: 310 }, (_, i) => i + 1));
  assert.equal(data.questions.filter(q => q.exam_pool === 'general').length, 300);
  assert.equal(data.questions.filter(q => q.exam_pool === 'berlin').length, 10);
  for (const q of data.questions) {
    const original = core.questions.find(c => c.id === q.id);
    for (const field of ['id_str', 'category', 'exam_pool', 'question_de', 'question_image', 'image_kind', 'correct_index', 'verification', 'assets']) {
      assert.deepEqual(q[field], original[field], `Question ${q.id}: ${field}`);
    }
    assert.equal(q.options.length, 4);
    assert.equal(q.options.filter(o => o.correct === true).length, 1);
    assert.equal(q.options[q.correct_index].correct, true);
    for (const [i, option] of q.options.entries()) {
      for (const field of ['text_de', 'image', 'correct']) assert.deepEqual(option[field], original.options[i][field]);
      assert.ok(option.text_en.trim(), `Question ${q.id}: English option ${i}`);
      if (option.image) assert.ok(fs.existsSync(path.join(root, 'app', option.image)));
    }
    for (const field of ['question_en', 'asking_note', 'answer_explanation']) assert.ok(q[field].trim(), `Question ${q.id}: ${field}`);
    assert.equal(q.distractor_notes.length, 4);
    assert.equal(q.distractor_notes[q.correct_index], '');
    if (q.question_image) assert.ok(fs.existsSync(path.join(root, 'app', q.question_image)));
  }
});
