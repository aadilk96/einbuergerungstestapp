# Einbürgerungstest Trainer — Berlin

A static German citizenship-test study app with **310 questions: 300 general + 10 Berlin**, German source text, English explanations, and the answer key captured from the official BAMF Online-Testcenter. A **Learn** mode adds 12 long-form lessons — German history, how the government is built, and the reasoning behind the Grundgesetz — each linking to the exact catalogue questions it explains.

**Live app:** https://einbuergerungstest-berlin.vercel.app

The mobile update is live as of 2026-09-09, deployed directly through Vercel's REST API. Git-based automatic deployment is not configured.

## Run locally

No build step, runtime dependencies, account, or external service is needed. From this repository's root:

```sh
python3 -m http.server 8124 --bind 127.0.0.1 --directory app
```

Open http://127.0.0.1:8124. Alternatively, open `app/index.html` directly. The complete downloaded app works via `file://`, including data and images. The hosted app has **no service worker**, so offline reload of the hosted site is not guaranteed.

## Features

- **Learn:** 12 lessons in four tracks (history, democracy, society, Berlin) that teach the reasoning behind the answers, with always-visible core sections plus collapsible "go deeper" sections. Each lesson embeds the live verified questions it explains and never restates the answer key, so its prose cannot drift from the verified data.
- **Browse:** read questions, reveal answers, expand English explanations, filter and jump by number.
- **Quiz:** shuffled practice with immediate feedback.
- **Focus:** practice wrong or starred questions independently of the Quiz round.
- **Exam:** 33 questions (30 general + 3 Berlin), 60 minutes, pass at 17; one question at a time, editable answers until submission, then paginated review.
- **Stats:** progress, streak and exam history.
- Mobile bottom navigation, light/dark themes, bilingual display, and full-size question images.

Progress is stored in the current browser/origin, not synchronized across devices. An active exam survives reload in the same tab using sessionStorage. When storage is denied, the app warns and runs in memory; reload may lose progress. The home countdown is a fixed demo-era setting, **not a booking or schedule for your test**.

## Repository layout

```text
app/                      Static hosting root
  index.html
  css/                    Styles
  js/                     Plain browser scripts
  data/questions.js       Runtime payload (window.QUESTIONS)
  data/questions.json     Reference copy, not required at runtime
  data/lessons.js         Learn-mode lessons (window.LESSONS)
  assets/img/             25 original question image assets
  vercel.json             Static hosting/cache settings
pipeline/
  questions.core.json     Canonical question/answer provenance; test input
  build_questions.py      Validating serializer/builder
  deploy_api.py           Allowlisted REST deployment or offline dry run
  audit_report.json       Historical reconciliation report
  crosscheck_report.json  Historical third-party comparison
tests/                    Node/Python tests and optional browser checks
HANDOFF.md                Accuracy model and maintenance constraints
```

PDFs, capture archives, English source shards and extraction/reconciliation inputs are intentionally not included. This is a runnable app snapshot, **not a fully reproducible source-capture pipeline**. Do not rebuild question data for UI changes. The builder requires separately supplied, verified English shards and fails when they are absent; tests reconstruct temporary fixtures from the shipped payload instead.

## Accuracy, provenance and limitations

| Content | Source |
|---|---|
| German questions, option wording/order and images | BAMF Gesamtfragenkatalog, Stand 07.05.2025 |
| Correct answer | [BAMF Online-Testcenter](https://oet.bamf.de/), Berlin catalogue captured in September 2026 |
| English translations and explanations | Generated study aids, followed by an adversarial review against the German source and supplied answer |

**The PDF contains no answer key.** Answers were reconciled from the Online-Testcenter onto the PDF's option order. English explanations are not official BAMF material and may contain mistakes.

Historical cross-checks used older third-party datasets from [defuncart](https://github.com/defuncart/einbuergerungstest) and [SiaExplains](https://github.com/SiaExplains/einbuergerungstest): 289 general questions aligned, 286 agreed; five flags include three substantive version/current-affairs differences. All 10 Berlin questions agreed with defuncart (SiaExplains has no Berlin coverage). These datasets do **not** provide complete, current independent validation.

- **11 general questions lack an external match:** 59, 66, 96, 111, 118, 149, 182, 184, 206, 235 and 288. These include the 2024 additions and an image question; their answer key is supported by the official capture, not a second independent key.
- **Question 226 (EU flag):** the main explanation is present, but all four `distractor_notes` entries are empty. This known gap is preserved, not silently filled.
- Current-affairs answers and catalogue wording can change. Consult the current official catalogue before an exam.
- Regression hashes prove preservation of the snapshot, **not correctness of the answers**. The September maintenance/export was not a fresh official-source audit.

See [HANDOFF.md](HANDOFF.md) and the historical reports for the matching rules and remaining limits.

## Tests

Use Node.js 18+ and Python 3.9+. From the repository root:

```sh
node --test tests/*.test.js
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
python3 -B pipeline/deploy_api.py --dry-run
```

Unit tests use local data, disposable storage/temporary fixtures and mocked deployment requests; **no network or production writes**. The dry run prints the runtime manifest without credentials or network. Optional browser checks are documented in [tests/README.md](tests/README.md); they need only the local app and disposable browser contexts. Chromium emulation is not physical-device/Safari verification.

## Hosting

Serve **`app/`**, not the repository root. For a future Vercel Git integration, set **Root Directory = `app`**, framework = Other, and no build command. Keep tests, pipeline data and reports outside the deployed root.

The optional REST deployer reads `VERCEL_TOKEN` securely from the environment. Set `VERCEL_TEAM_ID` for a team deployment; omit it for the token's default account scope. Set `VERCEL_PROJECT` to your project name (default: `einbuergerungstest-berlin`). No account/team/project identifier or credential is embedded.

```sh
python3 pipeline/deploy_api.py --dry-run
# Only with credentials configured securely and production publication intended:
python3 pipeline/deploy_api.py
```

**The second command publishes to production.** It is not a test. Never store credentials in this repository or put tokens in committed commands.

## Attribution

German question text and question images are attributed to the **Bundesamt für Migration und Flüchtlinge (BAMF)**; the answer key comes from its Online-Testcenter. [Official catalogue download](https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.pdf).

This project is an independent study aid, not an official BAMF product. Attribution does **not** grant a license to BAMF or other third-party material; no blanket licensing or redistribution promise is made here.
