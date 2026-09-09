# Static app

This directory is the hosting root for **Einbürgerungstest Trainer — Berlin**, covering 300 general and 10 Berlin questions. See the [root README](../README.md) for features, accuracy limitations, attribution and deployment.

From the repository root:

```sh
python3 -m http.server 8124 --bind 127.0.0.1 --directory app
```

Open http://127.0.0.1:8124 or open `app/index.html` directly. Data is a plain script (`window.QUESTIONS`); no build, dependency installation or external service is needed. All assets in a downloaded copy work via `file://`. Hosted offline reload is not guaranteed (no service worker).

- Browse, Quiz, Focus, timed 33-question Exam and Stats.
- Mobile bottom navigation, light/dark themes and optional English explanations.
- Progress uses localStorage `eb_state_v1`; active exams use sessionStorage `eb_exam_session_v1`. No cross-device sync. Denied storage warns and falls back to memory.
- Full-size question images remain available; English explanations are unofficial study aids.

German wording/images come from the BAMF catalogue; answers come from the BAMF Online-Testcenter. **The PDF has no key.** Question 226 has a known distractor-note gap, and older external datasets do not cover all questions. Read [HANDOFF.md](../HANDOFF.md) before changing data.

Runtime uses `data/questions.js`; `data/questions.json` is a reference copy. The canonical snapshot is `../pipeline/questions.core.json`. Do not regenerate question data for UI changes. The original verified English shards and source captures are not included.

For Vercel Git integration, configure Root Directory **`app`**, framework Other, no build command. Alternatively use the root-level `pipeline/deploy_api.py` after an offline `--dry-run`. Deploying is a separate production action, not a test.
