# Maintainer handoff — Einbürgerungstest Trainer

Snapshot: 2026-09-09. **Accuracy takes priority over content cleanup.** This public snapshot contains the runnable app, canonical test input and historical reports. It does not contain source PDFs, capture archives, English shards or the full extraction/reconciliation toolchain.

## Source-of-truth split

| Field | Authority |
|---|---|
| German question stems, option text/order and images | BAMF Gesamtfragenkatalog, Stand 07.05.2025 |
| Answer key | BAMF Online-Testcenter at https://oet.bamf.de/, Berlin catalogue, September 2026 capture |
| English study aids | Generated, then adversarially reviewed against the German text and given answer |

**The PDF has no answer key.** Its checkboxes are empty glyphs: U+F0A3 and, for ten newer questions, U+25A1. Never infer answers from those boxes. The two official materials serve different roles; they are not two independent answer keys.

The recorded Online-Testcenter capture selected Berlin and advanced sequentially through questions 1–310. The correct radio was identified by `id="FARBE"`, corroborated by the site's correct/incorrect labels after selection. Treat these as historical implementation details, not a stable API. Any future capture must check the current site's behavior and complete, unique coverage.

## Reconciliation rules

`pipeline/questions.core.json` is the canonical snapshot. `correct_index` is zero-based and refers to **PDF option order**, never a shuffled browser order.

- Match question number; 1–300 are general, 301–310 are Berlin (`BE-1` through `BE-10`).
- Image/numeric answers map a numbered option to index minus one.
- Text answers were fuzzy-matched to the four PDF options using the maximum of plain-text and sorted-token similarity.
- Keep gender-order normalization: plain `SequenceMatcher` alone previously confused question 37's `Premierminister` and `Ministerpräsident` options.
- Historical `ambiguous_answer_match` flags on 59, 71 and 108 have confidence 1.0 and were inspected: the correct option matches exactly, but a distractor is also similar. A flag alone is not permission to change an answer.

`audit_report.json` records reconciliation results. `crosscheck_report.json` records a September 2026 comparison with older public datasets from defuncart and SiaExplains. Reports are historical observations, not a guarantee that every answer remains current.

## External coverage and remaining content gaps

- General: **289 aligned, 286 agreeing**, out of 300. Five flags include three substantive version/current-affairs differences.
- Flags: 13 is formatting; 14 has a revised option set; 72 and 73 reflect newer officeholder/parliament information; 236 differs in one older source's pre-Brexit EU count.
- Berlin: **10/10 agreed with defuncart**. SiaExplains supplies no Berlin questions.
- No external match for **59, 66, 96, 111, 118, 149, 182, 184, 206, 235, 288**: the 2024 additions plus an image question. These rely on the official capture and recorded manual inspection, without another independent key. Do not advertise full independent verification.
- **Question 226:** the EU-flag question has a main explanation but four empty `distractor_notes`. The builder has a narrow compatibility exception for exactly that ID/image shape. Do not generalize it or invent missing notes without inspecting the source images in a separate content review.
- English explanations are unofficial and can be wrong. Current-affairs content can become stale.

## Runtime architecture

`app/` is the static deployment root. No build, framework, runtime dependencies, fetch-based data loading or ES modules are required. `data/questions.js` sets `window.QUESTIONS`; preserve this for direct `file://` use.

- `store.js`: field-by-field progress normalization and persistence.
- `data.js`: catalogue/filter/sampling helpers.
- `session.js`: DOM-free study rounds, validated exam state, grading and duplicate-submission guard.
- `ui.js`: shared accessible questions/options/images/disclosures.
- `app.js`: routing/rendering and sole exam interval owner.
- `learn.js`: the **Learn** mode. An XSS-safe block/inline renderer over `window.LESSONS` (from `data/lessons.js`, a plain script like the question payload — keep it for `file://` use) plus the lesson index and lesson views. It reuses `ui.js` to render each lesson's linked questions live from `window.QUESTIONS`, so lesson prose **never restates or drifts from** the verified answer key. Routing adds `#/learn` and `#/learn/<id>`; `app.js` exposes a small shared view API (`view`, `begin`, `finish`, `setActiveTab`, `storageWarning`, `button`) for it. The lesson-authoring toolchain (draft → triple-verify against constitutional/historical/answer-key lenses → reconcile) is **not included in this snapshot**, matching the excluded English-shard pipeline; regenerating lessons needs it plus the verified question data. `deploy_api.py` allowlists `data/lessons.js` and `js/learn.js` as runtime files.

Preserve localStorage `eb_state_v1`, sessionStorage `eb_exam_session_v1` and valid legacy sessions. Learn-mode "read" state lives in a **separate** localStorage key `eb_learn_v1`; it never mixes into `eb_state_v1`. Browse snapshots IDs until deliberate refresh/filter change; marking a question seen must not shrink that round. Quiz and Focus are independent; language changes must not unlock/re-score answered questions.

Exam/review display one question at a time. Choices stay editable until submission and correctness stays hidden while active. The immediate timer tick runs before interval allocation; an expired/completed session must grade only once. Denied storage keeps live state in memory but does not promise reload persistence.

The downloaded app supports offline `file://`; hosted offline reload is not guaranteed because there is no service worker. The home countdown is legacy demo configuration, not a test booking. Original question image bytes and aspect ratios are preserved; avoid recompression or cropping.

## Builder and safe changes

Do not rebuild data for CSS/JS changes. The public copy excludes English source shards; default builds therefore fail safely until complete verified inputs are supplied. Tests reconstruct English records from the shipped payload into temporary fixtures, without changing runtime data.

`build_questions.py` accepts script-relative defaults and explicit `--core`, `--shards`, `--app`, `--output`. It requires complete `final_*` records; draft fallback needs explicit `--allow-drafts`, and final wins. It validates and serializes both outputs before replacement. Each replacement is atomic, but the pair is **not a transaction**; verify JS/JSON equality after an authorized build.

For a source refresh, collect fresh official sources, validate 310 complete/unique records and answer-order mapping, inspect images, cross-check against a current external source where possible, then review English. Work in isolated output directories before replacing canonical data. Extraction/reconciliation tools are omitted here: their original write-before-final-validation and coverage checks require further hardening before reuse. The snapshot alone cannot reproduce the full evidence chain.

`assets.oet_screenshot` fields are historical relative provenance references; those screenshots are intentionally not included and are not runtime dependencies.

## Verification

From the repository root:

```sh
node --test tests/*.test.js
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
python3 -B pipeline/deploy_api.py --dry-run
```

Unit tests use local fixtures, disposable storage and mocked requests. They make no network calls and do not write the app payload. Hash pins protect the core, JS/JSON payloads and all 25 image assets; they prove preservation, not answer correctness. Do not weaken pins to hide unexpected changes.

See [tests/README.md](tests/README.md) for optional disposable-context browser checks and their portable `fileUrl` parameter. Earlier maintenance checks covered 86 layout/image cases, 6 state scenarios and 9 extended UI cases in Chromium/touch emulation; physical iPhone/Safari/WebKit remains unverified. Browser checks were not rerun as part of the standalone export.

## Deployment boundary

The mobile update was deployed directly through Vercel's REST API on 2026-09-09. The public site is https://einbuergerungstest-berlin.vercel.app. Git automatic deployment is not configured.

The REST deployer uses `VERCEL_TOKEN`, optional `VERCEL_TEAM_ID`, and `VERCEL_PROJECT` (default project name `einbuergerungstest-berlin`). The dry run is offline; a real invocation publishes to **production**. Keep credentials out of files and command arguments. Only runtime scripts/styles/images/config enter the deployment manifest; tests, reports and reference JSON do not.

For any future Git-hosted Vercel setup, set Root Directory to **`app`**, framework Other, no build command. Never deploy the whole repository root.
