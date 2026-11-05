# Catch audit (JOS-253)

- Date: 2026-11-04
- Change: cover-error-reporting (tasks 5.1–5.5, design D2)
- Scope: every `catch` block and promise `.catch(` handler in `backend/src`: **102**. The ticket counted 82 `catch` blocks; the other 20 are `.catch(` handlers.
- Command: `grep -rnE "catch *(\(|\{)|\.catch\(" backend/src`
- Line numbers are those after the change.

## Counts per group

| Group | Meaning | Count | Changed |
|---|---|---:|---:|
| A | Becomes an outcome that is already reported or shown (attempt outcome, provider request outcome, a failure result) | 56 | 0 |
| B | Rethrows, or answers HTTP | 23 | 0 |
| C | Swallows by design | 19 | 7 comments added |
| D | Lost: caught, logged at most at `info`, reported nowhere | 4 | 4 now report |

## D: lost errors, now reported

Each one now calls `recordCaughtError(error, { stage })` (new in `telemetry/index.ts`: the error's name as the code, plus its message and stack). Nothing else in the block changed: same returns, same logging.

| Location | What was lost | Stage |
|---|---|---|
| `orchestrator.ts:1105` | The image file could not be read before a clip request. The scene is failed directly, with no attempt and no request, so neither reporting path saw it. | `video` |
| `voiceOverPhase.ts:474` | `generateVoiceOver` rejected in its background launch. It was logged at `info` with the error's name only. | `voice-over` |
| `decompositionPhase.ts:274` | `runDecompositionPhase` rejected in its background launch. It was logged at `info` with the error's name only. | `decomposition` |
| `retry/retryScheduler.ts:141` | `releaseAttempt` dropped the rejection of a sender that throws (`settled.catch(() => {})`). | the attempt's stage |

Tests: `retry-scheduler.test.ts` ("A sender that throws") and `error-log.test.ts` (`recordCaughtError`). The two background launches and the unreadable image had no test on their catch path; no new harness was built for them (design D2).

`telemetry/processHandlers.ts` now uses `recordCaughtError` too, and reports the same fields as before.

## C: swallowed by design

| Location | Why | Comment |
|---|---|---|
| `db.ts:962` | `isReadableMp4`: unreadable means "not a readable MP4" | already documented |
| `db.ts:1003` | reference image vanished: report no image | already there |
| `db.ts:1046` | the snapshot's file vanished: the session starts without a reference image | **added** |
| `db.ts:1929`, `db.ts:2406` | telemetry must never fail a database write | already there |
| `adminAccess.ts:23` | an unreadable secrets file counts as no password, so the gate stays closed | already documented |
| `config/ffmpeg.ts:33` | no subtitle filter; the boot log warns | **added** |
| `keyStore.ts:116` | no legacy key | already documented |
| `util/redactPaths.ts:23` | no OS user name; paths are still scrubbed | **added** |
| `sessionPauses.ts:35` | unreadable timestamps: the pause view shows none, and assembly fails as not retryable | **added** |
| `scenePause.ts:89` | characters that do not match the script: no derivable pauses | **added** |
| `telemetry/index.ts:65`, `:66` | provider shutdown in `resetTelemetryForTest` | test-only |
| `telemetry/index.ts:169` | `writeErrorLog`: a failing log must never fail the caller | already there |
| `telemetry/index.ts:184`, `:189` | flush and shutdown never reject | already documented |
| `telemetry/index.ts:198` | `guarded`: one throttled local warning (reporting from inside the reporter could loop) | already there |
| `telemetry/index.ts:222` | `reportFailures`: a throwing exporter becomes a failed export, then a throttled warning | already there |
| `telemetry/updateCheck.ts:38` | the GitHub update check failed; warned locally, not an app error | the `warn` call says it |

`providerConnectionCheck.ts:27` (a body that is not JSON) is counted under B, because the check reports the HTTP status. It also got an added comment, so 7 comments were added in all.

## B: rethrows or answers

- `db.ts:479`, `525`, `1383`, `1473`, `1830` and `2474`: `ROLLBACK`, then rethrow.
- `db.ts:888`, `925`, `947`, `1539`, `1578`, `2330` and `2355`: an expected `EEXIST`, `ENOENT` or unique-constraint error becomes a typed answer; anything else is rethrown.
- `keyStore.ts:80` and `sceneRegistration.ts:184`: rethrow, or a typed answer.
- `retry/retryScheduler.ts:96`: the throw is forwarded as a rejection, unchanged.
- `routes.ts:745` and `788`: answers 404.
- `adminProviderRoutes.ts:139`: answers `no-key`.
- `providerConnectionCheck.ts:27`, `44` and `87`: answer the connection-test outcome.
- `server.ts:233`: a failed start prints and exits 1, before the error log or the process handlers exist.

## A: outcomes already reported

- **Provider adapters:** `imageProvider.ts` (12), `videoProvider.ts` (10), `visualInstructions.ts` (4), `voiceProvider.ts` (3), `alignmentProvider.ts` (3) and `scriptModeration.ts` (3).
  - A missing key becomes `failed_not_retryable`, which is reported.
  - A network or shape failure becomes `failed_transient`, `check-failed` or `invalid_output`, which is retried and counted in the provider metrics.
  - Moderation failures become `unavailable`, which the request answers.
- **Orchestrator** (9 of 10: `714`, `945`, `1024`, `1147`, `1246`, `1312`, `1398`, `1428`, `1436`): adapter throws become transient or check-failed results; the missing reference image becomes a not-retryable request.
- **Phases:**
  - `voiceOverPhase.ts:121`, `170` and `409`: an audio check result, a storage result, or a transient outcome.
  - `narrationTimestampsPhase.ts:69`, `97` and `213`: usability results and stage failures.
  - `decompositionPhase.ts:64`: the caller records a segmentation failure (comment corrected).
  - `segmentation.ts:57`: a failure reason.
  - `assemblySubtitles.ts:19`: `null` becomes a not-retryable assembly failure.
  - `ffmpegAssemblyTool.ts:237`: a transient assembly outcome.
- **Settings:** `config/settings.ts:108` and `114`: settings problems surfaced in the boot log and the admin page.

Transient failures were left unreported on purpose (spec: "A transient provider failure that the retry policy handles SHALL NOT be reported as an error").

## Verification

- `npx tsc --noEmit` and `npx eslint src`: clean.
- Full backend suite with a scratch `DB_PATH` and `PROJECTS_ROOT`: 2688 passed, 11 skipped (209 files passed, 5 skipped).
