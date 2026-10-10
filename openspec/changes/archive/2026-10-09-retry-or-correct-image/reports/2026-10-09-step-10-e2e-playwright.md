# Step 10 Report - Browser E2E (JOS-157, retry-or-correct-image)

- Date: 2026-10-09
- Agent: Claude Sonnet 5
- Tool used: `playwright-cli` (fresh Chromium), the same tool `see-provider-and-attempts` (JOS-166) and `distinguish-paused-session` (JOS-153) found more reliable than the Claude-in-Chrome extension for this app.

## 10.1 — Applicability

Applies: the scene details and correction form change.

## 10.2 — Setup

- Backend: scratch `DB_PATH`/`PROJECTS_ROOT`, `ALLOW_TEST_ENDPOINTS=1`, `USE_STUB_VOICE_PROVIDER=hang`, port 3100.
- Frontend: `npm run dev` (Vite), port 5173, default `VITE_API_BASE`.
- A session was created, then a real registered scene was inserted and launched through the real image stage the same way as the step-9 curl test (`insertRegisteredScenes` + `launchImageStage` via one-off scripts, no stub involved) — it failed with the missing-`FAL_API_KEY` not-retryable error, same as any real image failure would look to the page.

## 10.3 — Scene details show PROMPT, IMAGE, VIDEO; form pre-filled with IMAGE

Opened `http://localhost:5173/?sessionId=<id>` and expanded scene 0. Accessibility snapshot:

```
term "PROMPT": definition "A lighthouse beams across the bay."
term "IMAGE": definition "A lighthouse at dusk with a sweeping beam"
term "VIDEO": definition "Slow pan across the water"
term "Affected stage": definition "image"
group "Scene 0 image diagnostics": "Image: Fal.ai (fal-ai/flux/dev), 1 attempt"
button "Retry scene 0"
form "Correct scene 0 image instruction":
  textbox "Corrected image instruction for scene 0": "A lighthouse at dusk with a sweeping beam"
  button "Save correction and retry"
```

The textbox is pre-filled with `IMAGE`, not the legacy instruction. Screenshot: `2026-10-09-step-10-e2e-playwright.png` — the provider line already shows `Fal.ai (fal-ai/flux/dev)`, confirming the scene went through the real image stage, not a stub.

## 10.4 — Correcting and submitting updates the row live

Filled the textbox with "a corrected lighthouse, warmer tones" and clicked "Save correction and retry". The next snapshot, with no reload:

```
term "IMAGE": definition "a corrected lighthouse, warmer tones"
```

`VIDEO`/`PROMPT` were unchanged in the same snapshot. The submitted correction then sent a real retry (no credential, so it failed again the same way), matching the step-9 curl result.

## 10.5 — AC3: nothing offered once the scene is no longer failed at the image stage

Marked the scene `image-complete` out of band (the same store-function technique as step 9), without broadcasting. The open page's live connection picked it up on its own (this app's `useLiveSession` re-fetches the full snapshot on every reconnect — a reconnect happened in the background during the test, ahead of a planned stale-click race test). The next snapshot shows no `Retry scene 0` button and no correction form, with `<img "Scene 0 image">` now present instead — matching spec "Nothing offered on the page". This pre-empted directly observing a stale-click 409 in the browser; the refusal-sentence rendering itself (`not-failed`/`image-already-generated`/`unknown-scene`/unknown-reason fallback) is already covered at the unit level (`components.test.tsx` > "Scene retry and correction refusals show a sentence", 5 tests) and the HTTP 409 is covered at the curl level (step 9).

## Console

2 info messages (React DevTools notice, expected) and 1 pre-existing `favicon.ico` 404, unrelated to this change. No errors from anything this change touches.

## Cleanup

Browser closed (`playwright-cli close`). Backend and `vite` dev server processes killed. Scratch store (`/tmp/jos157-e2e/`) removed. Confirmed the default store untouched:

```
stat -f "%Sm" /Users/josemunoz/Software/Vid4You/AI4Devs-finalproject/backend/data/skeleton.sqlite
# Oct 4 22:39:07 2026 — unchanged
```

## Outcome

- Step 10 status: PASS
- Blocking issues: none
