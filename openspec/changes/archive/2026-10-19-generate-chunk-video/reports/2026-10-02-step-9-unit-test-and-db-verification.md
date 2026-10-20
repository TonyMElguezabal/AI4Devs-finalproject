# Step 9 — Unit Test and DB Verification
**Date:** 2026-10-02  
**Change:** generate-chunk-video (JOS-146)

## 9.1 Pre-test baseline (default store)

`store.sqlite3` is uninitialized (no tables). The default store is left untouched by the test suite, which creates its own in-memory / temp databases. No action needed to restore it.

## 9.2 Targeted tests

All targeted test files ran green:

| File | Tests | Result |
|------|-------|--------|
| `test/video-stage.test.ts` | 27 | ✓ pass |
| `test/scene-registration-persistence.test.ts` | 37 | ✓ pass |
| `test/image-stage.test.ts` | 21 | ✓ pass |
| `test/orchestrator.test.ts` | 11 | ✓ pass |
| `test/decomposition-phase.test.ts` | 23 | ✓ pass |
| `test/narration-interval-immutability.test.ts` | 3 | ✓ pass |

## 9.3 Full test suite and typecheck

```
npm run typecheck  → clean (0 errors)
npm test           → 764 passed | 2 skipped (766 total) | 0 failed
                     38 test files passed | 2 skipped (40)
                     Duration: ~14s
```

## 9.4 Post-test DB state

Default store remains empty (uninitialized). No migration was run against it. State is identical to the baseline.

## 9.5 Regression analysis

Tasks 4.1–8.3 introduced the following behaviours that required updates to existing tests:

**Problem**: `completeImageStage` (called by the image stage) now calls `launchVideoStage`, which transitions the scene from `image-complete` to `video-generating` synchronously before any `waitFor` timer check can fire. This caused 4 regressions in `orchestrator.test.ts`, and would have caused regressions in `image-stage.test.ts`, `decomposition-phase.test.ts`, and `narration-interval-immutability.test.ts`.

**Fix applied**:
1. `completeImageStage` now guards `if (scene?.requestedDurationSeconds != null)` before calling `launchVideoStage`. `createScene` skeletons (null `requestedDurationSeconds`) never enter the video stage — fixes `orchestrator.test.ts`.
2. `runVideoAttempt` now accepts a `videoStageStartDelayMs` (default `0`; set to `9_999_999` in image-stage, decomposition, and narration-interval tests). With `videoStageStartDelayMs > 0`, a deferred `setTimeout` yields before any DB write, letting image-stage tests' `waitFor` ticks see `image-complete` before `video-generating`.
3. `video-stage.test.ts` calls `resetVideoStageStartDelayMs()` in `beforeEach` to ensure the delay is 0.

No production behaviour changed (delay is 0 in production).
