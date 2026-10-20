# Step 9 Report — Manual Endpoint Testing

- Date: 2026-09-30
- Change: generate-chunk-image (JOS-145)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-145-generate-chunk-image` at `8cc8336`

## Setup

The real server (`node src/server.ts`-equivalent, built via a small launcher script kept in the scratchpad, not the repo) on a scratch database and scratch projects folder (`DB_PATH`, `PROJECTS_ROOT`, `PORT=3199`). Since nothing in the running app calls `segmentStoredTimestamps` yet (JOS-136's own wiring is not done), the launcher stores a voice-over and native timestamps directly (matching JOS-142/JOS-143's own step-10 precedent) and calls it in-process, with `setImageProviderRegistry`/`setDownloadFetch` (`imageProvider.ts`) configured per scenario before the server starts listening — the registry is in-process module state, so a scratch-configured stub can't be reached from a separately-started `node src/server.ts`; the launcher builds the app itself instead.

A real session id had to be a valid ULID for the session-read route to find it (`GET /sessions/:id` reports an unrecognised identifier shape as 404 "session not found" by design, consult-session JOS-135 Decision 4) — the launcher generates one with `util/ulid.ts`'s own `ulid()`.

## 9.1 — Health check

```
curl -s -i localhost:3199/health
HTTP/1.1 200 OK
{"ok":true}
```

## 9.2 / 9.3 — Launch, completion, and differing latencies

A two-chunk session was registered (each sentence 9.4s/10.4s narrated alone — within the 5-15s bounds — but combined ~19.8s, forcing segmentation to keep them as two separate chunks rather than merging). The stub image adapter resolved the first call immediately and delayed the second by 1.2s.

Polled immediately once `/health` responded:

```
1 image-complete
2 image-generating
```

Polled 1.5s later:

```
1 image-complete  manual-test-adapter  scene-1-attempt-1.png
2 image-complete  manual-test-adapter  scene-2-attempt-1.png
```

Both result paths existed on disk under the session's own project folder, as valid PNG headers (`file`: "PNG image data, 1920 x 1088"). `provider` was set on both scenes as soon as each reached `image-complete`. This confirms: automatic launch after registration with no User action (AC1), `submitted → image-generating → image-complete` (never `chunk-complete`), the stored result is a real file on disk, the provider is bound, and one chunk completing does not wait for or block a sibling (AC3).

## 9.4 — Temporary link

A single-chunk session with a stub returning `{ source: "temporary-url", url: "https://example.test/fake-image.png" }` and `setDownloadFetch` returning a canned PNG body for any URL:

```json
"result": { "imageUrl": "scene-1-attempt-1.png" }
```

`result` never contained `http`; the file existed on disk as a valid PNG. Confirms §12.2: a temporary link is resolved to a local file before the chunk completes.

## 9.5 — Portrait image rejected

A single-chunk session whose stub always returns a 1080×1920 image (every attempt, deterministically):

```json
{
  "state": "failed",
  "attempts": 4,
  "errorCause": "the generated image is 1080x1920, not an accepted horizontal 16:9 size (retry budget exhausted after 4 attempts)",
  "affectedStage": "image",
  "result": null
}
```

The attempt was recorded as failed and the chunk never reached `image-complete` — confirmed at each attempt (first poll already showed the exhausted-budget failure, since the stub deterministically kept failing through all `1 + RETRY_BUDGET` automatic retries).

**Additional check, not required by the task list but run anyway and worth recording:** `POST .../scenes/:id/retry` on this failed chunk answered `200 {"ok":true}` and the scene reached `image-complete` with `result: "scene-1.png"` and an unchanged `provider`. This is the already-documented, deliberately out-of-scope gap (design.md's Risks, and the proposal's "Out of Scope" list): `manualRetry`/`correctAndRetry` still call the generic `launchScene`/`provider.ts` path, not `launchImageStage`, for any chunk — including a real one. Retrying or correcting a failed `IMAGE` instruction is JOS-157's scope. This is not a defect in this story's own acceptance criteria (none of which cover manual retry), but it is a real, now-confirmed interaction worth flagging loudly to JOS-157 (added to the task 12.1 hand-off).

## 9.6 — One real Fal.ai generation

Script: "A lighthouse at dusk with waves breaking on the rocks." Credential read from `.secrets.json`'s `FAL_API_KEY` (present, not printed).

- Request sent at session creation; resolved ~9 seconds later (polled every 1s).
- `provider`: `fal-ai/flux/dev` (bound on the first, only attempt).
- `result`: `scene-1-attempt-1.jpg`, downloaded from Fal.ai's returned URL (never stored as the URL itself).
- Stored file: `file` reports "JPEG image data, ... 1920x1088, components 3", 902880 bytes — passes `isAcceptedImageSize` (0.74% off exact 16:9, as designed).
- Visual check: a real, correctly-generated image of a lighthouse at dusk with waves breaking on rocks, matching the instruction (viewed directly, not just probed).
- Cost: not itemized per-call in Fal.ai's response (matches the JOS-165 step-5b finding); negligible per FLUX.1 [dev]'s published cents-per-image pricing tier. One call made, as budgeted.

## 9.7 — Cleanup

Scratch store before reset: 1 row in each of `runs`/`scenes`/`scene_results`/`provider_requests`/`voice_overs`/`narration_timestamps`, 3 files on disk (the real-call session's artefacts — the earlier scenarios each ran against their own freshly-recreated scratch database/directory pair). `resetAll()` (test-only) emptied every table and the projects folder:

| | Before | After |
|---|---|---|
| `runs`/`scenes`/`scene_results`/`provider_requests`/`voice_overs`/`narration_timestamps` | 1 each | 0 each |
| files under `PROJECTS_ROOT` | 3 | 0 |
| triggers | 11 | 11 |
| migrations | 2-8 | 2-8 |

(This branch's base is `feature/entrega-2-JAME`, which tops out at migration 8; migration 9, JOS-143's narration-interval columns, is not on this branch. That is expected, not a discrepancy.)

Default store, inspected read-only after the whole session: every table 0 rows, 13 triggers, migrations 2-9, `data/projects` empty — identical to the step 8 baseline. No tracked file modified (the launcher script and every scratch DB/directory live entirely under the session scratchpad, never under `backend/`).

## Result

PASS. Automatic launch, independent per-chunk completion, temporary-link download, the output-size rejection and its retry-budget exhaustion, and one real Fal.ai generation all verified against a running server. The scratch store was fully reset and the default store was never touched. One already-documented, out-of-scope gap (manual retry of a real image failure) was empirically confirmed and added to the JOS-157 hand-off.
