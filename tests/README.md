# Regression checks

These checks protect application behavior and the existing verified dataset. They **do not replace an official-source answer audit**. See `../HANDOFF.md` for provenance.

## No-install unit tests

From the repository root:

```bash
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The Node tests use built-in `node:test` and VM-loaded plain scripts. Python tests use standard-library `unittest`, temporary fixtures, and mocked deployment requests. Tests must not regenerate the real app payload, edit question data, contact Vercel, or reset a real user's progress.

`content.test.js` pins the pre-cleanup SHA-256 values for the canonical and generated question files and all original question images. For a future **authorized content update**, verify it against the official sources first and then deliberately update the baseline. Do not weaken the tests to make unexpected changes pass.

## Browser layout checks

Start the app:

```bash
python3 -m http.server 8124 --bind 127.0.0.1 --directory app
```

Run `tests/browser-check.js` using Playwright MCP's `browser_run_code_unsafe` with the absolute file path in `filename`. The script creates its own disposable browser context. It checks Home and all five modes at 320, 375, 390, 430, 768 and 1280 pixels in light/dark, navigation hit targets, horizontal overflow, every image question and landscape layout.

Run `tests/browser-state-check.js` the same way for automated Unseen/Quiz regressions, exam reload/submit/timeout, malformed progress and denied-storage checks. It also creates disposable contexts, with touch/mobile emulation.

Run `tests/browser-ui-check.js` for expanded explanations, populated Focus/Stats, editable exam choices/navigator, enlarged text with wrapped timer controls, keyboard skip link, and `file://` images/full-size links. It accepts `(page, { fileUrl })`: supply a URL for this checkout's `app/index.html`, constructed with Node's `pathToFileURL(path.resolve('app/index.html')).href` when using your own Playwright runner. For MCP's one-argument invocation, first navigate the supplied page to this checkout's local `app/index.html`; the script takes its file URL from `page.url()`. It fails explicitly if no local file URL is available. No developer-specific filesystem path is embedded.

All three scripts assume the test server is on `http://127.0.0.1:8124`. Adjust URLs if necessary. Playwright MCP is development tooling, not an application dependency.

Prior maintenance verification (2026-09-09) recorded **12 Node tests, 17 Python tests, 86 layout/image checks, 6 browser state scenarios and 9 extended UI checks**. Browser checks used Chromium/touch emulation, not physical iPhone/Safari/WebKit. The standalone export reruns the unit suites (including deployment-configuration regressions); it does not rerun the browser scripts. Python outputs use temporary directories and deployment requests are mocked. These tests never perform production deployment.

## Interactive acceptance checklist

Layout checks alone do not validate a study session. Also exercise:

- **Browse:** Unseen → Next visits consecutive remaining questions. Language changes retain the current question and reveal/English disclosure state. Reset/refresh filters deliberately. Jump-to input has a label and works by keyboard.
- **Quiz/Focus:** answer once, toggle language, navigate to another mode and back: the same answer stays recorded once. Quiz and Focus keep separate rounds. Changing filters starts a coherent new round. Empty Focus gives useful guidance.
- **Explanation:** answer feedback and Next are before the disclosure. Expanding English preserves translation, asking note, correct-answer background, and distractor notes. No explanation is available in a running exam.
- **Images:** original aspect ratio, no crop, no collapsed loading frame; full-size image links do not select an answer. Inspect all 13 image questions (IDs 21, 55, 70, 130, 176, 181, 187, 209, 216, 226, 235, 301, 308).
- **Exam:** 33 unique questions (30 general + 3 Berlin), one visible question, change an answer, use Previous/Next and the number navigator, reload and resume. Submit confirmation can be cancelled. Unanswered questions score zero. Review is paginated with explanations available after submission.
- **Timer:** resume an already expired stored exam in a disposable context. It grades exactly once, creates one history entry and leaves no interval running. Test manual submission at the expiry boundary and reloading completed results.
- **Storage:** invalid JSON, `{ "seen": null }`, invalid exam IDs, and denied local/sessionStorage do not blank the app. Existing valid progress survives field normalization. A denied persistence write warns that progress may be lost on reload; the current in-memory session remains usable.
- **Accessibility:** actual taps on Stats and all nav items, 44px targets, visible keyboard focus, pressed/selected states, no answer leakage via labels/styles before exam submission. Bottom navigation must not cover controls/footer. Test a short landscape screen and enlarged text.
- **Offline/local:** double-click `app/index.html` (`file://`) and verify data, images and all modes. A downloaded local copy works offline; the hosted site does not promise offline reload because there is no service worker.
- **Browsers:** run a touch-emulated phone context. Use WebKit if installed. Report any missing physical-device/Safari verification rather than calling Chromium emulation an iPhone test.

Use disposable contexts for corruption/reset/expiry tests. Do not clear the user's actual learning progress.
