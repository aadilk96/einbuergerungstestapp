# Einbürgerungstest Trainer (Berlin)

A static study app covering **310 questions** (300 general + 10 Berlin), with the official answer key and deep English explanations. Built for the **18 September 2026** exam at VHS Pankow.

Beyond drilling questions, a **Learn** mode delivers 12 deeply-researched, triple-verified lessons (German history, how the government is built, the reasoning behind the Grundgesetz) organised in four tracks. Every lesson links to the exact catalogue questions it explains and renders them live from the verified data, so lesson prose never restates — and never drifts from — the answer key.

Public URL: https://einbuergerungstest-berlin.vercel.app

## Run locally

No build step, runtime dependencies, account, or LLM service.

```bash
cd life-admin/einbuergerung
python3 -m http.server 8124 --bind 127.0.0.1 --directory app
# open http://127.0.0.1:8124
```

You can also double-click `app/index.html`. Data loads through a plain script (`window.QUESTIONS`), so a downloaded copy with its assets works offline via `file://`. **The hosted site does not guarantee offline reload**: it has no service worker. Progress is local to each browser/origin, not synchronized between phone and laptop.

## Study controls

- **Learn:** 12 long-form lessons in four tracks (History & Responsibility, Living in Democracy, People/Society & Europe, Berlin). Each has always-visible **core** sections plus collapsible **Go deeper** sections, embeds the live verified questions it explains, links to authoritative sources, and tracks a "read" state. Reach it from the first nav tab or the Home card.
- **Vocab:** the test-specific German vocabulary, ranked by importance — how often each word-family appears across the 310-question pool and how often it is the correct answer. Grouped into Critical / High-value / Solid tiers, filterable by topic, with a "known" toggle. Each entry links to the exact questions it appears in, rendered live from the verified catalogue (so counts never restate the answer key). General B1 German (question words, modals, negations) is deliberately kept out of the ranking and shown as a short reading aside.
- **Browse:** read the official questions in order. Show the answer or expand **Explain in English** for the translation, what the question is asking, historical/civic background and distractor notes. Previous/Next and jump-to navigate the current filtered list.
- **Quiz:** shuffled questions with immediate right/wrong feedback. Next stays before the optional explanation. An answered question stays locked across language changes.
- **Focus:** a separate practice round containing wrong or starred questions.
- **Exam:** one question at a time, 33 total (30 general + 3 Berlin), 60 minutes, pass at 17. Use Previous/Next or the question navigator; answers remain editable until submission. No explanations/correctness feedback during the exam. Results include paginated review.
- **Stats:** progress, streak and exam history.

On phones, the study modes are in bottom navigation; language and theme controls stay in the header. **DE/EN** shows or hides English alongside the official German text. Detailed question images have full-size links.

Progress, stars and exam history use localStorage (`eb_state_v1`). The current exam uses sessionStorage (`eb_exam_session_v1`) and survives reload in the same tab. If storage is denied, the app warns and continues in memory; do not rely on progress surviving reload in that case. Browse/Quiz/Focus rounds are in-memory; their progress records are persistent.

## Accuracy and maintenance

| Field | Source |
|-------|--------|
| Exact German question and option text, images | Official BAMF Gesamtfragenkatalog PDF (Stand 07.05.2025) |
| Correct answer | Official oet.bamf.de Online-Testcenter (Berlin) |
| English explanations | Generated, then adversarially checked against the verified answer |
| Learn-mode lessons | Drafted per lesson, then triple-verified (historical, constitutional, and answer-key-consistency lenses) and reconciled. Facts checked against gesetze-im-internet.de, bpb.de and other official sources; prose never restates the key. Build tooling: `../pipeline/lessons_build/`. |

**The PDF has no answer key.** The key is reconciled from oet onto PDF option order. Read **[HANDOFF.md](../HANDOFF.md)** before changing data: it documents the matcher fix, cross-check limitations and the 11 newer questions without an independent third-party match.

Canonical data: `../pipeline/questions.core.json`. Runtime payload: `data/questions.js`; `data/questions.json` is a reference copy and is not deployed. Images: `assets/img/`. Capture evidence and English source shards live outside the app.

Learn-mode content: `data/lessons.js` (`window.LESSONS`), loaded as a plain script. Regenerate via `../pipeline/lessons_build/` (`build_specs.py` → content workflow → `extract_from_journal.py` → `assemble_lessons.py`); `assemble_lessons.py` enforces the question-id links and re-writes the file. `tests/lessons.test.js` guards its structure and that every referenced question id exists.

**Do not rebuild data for CSS/JS changes.** A rebuild requires the original verified shards, which are ignored by git. Missing inputs must fail, not silently replace explanations with blanks or drafts. Only regenerate content as a separately verified task.

## Regression tests

From `life-admin/einbuergerung/`:

```bash
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

See [tests/README.md](../tests/README.md) for disposable-context mobile, state, timer, storage and `file://` checks. Tests are development-only, outside the deployment root.

## Deploy to phone-accessible hosting

The verified deployment method here is the REST script. The original team-scoped token failed with the CLI; a fresh `vercel login` succeeded on 2026-09-09 and its credential worked with the REST script. The mobile update is live as of that date. From `life-admin/einbuergerung/`:

```bash
python3 pipeline/deploy_api.py --dry-run
# With VERCEL_TOKEN set securely in the environment, and publication authorized:
python3 pipeline/deploy_api.py
```

**The second command publishes to production.** Do not run it just to validate local changes. Never put the token into source, documentation, or a committed command. The deployment manifest includes only runtime files/assets, not tests, README, source captures, private documents, or the JSON reference copy.

`vercel.json` retains static hosting and cache revalidation for the stable asset filenames. See HANDOFF for the deployment target and source-verification procedure.
