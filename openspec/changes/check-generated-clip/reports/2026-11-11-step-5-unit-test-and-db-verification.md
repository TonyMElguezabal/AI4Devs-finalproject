# Step 5 report — unit tests and database verification (JOS-265)

- Date: 2026-11-11
- Branch: `feature/jos-265-check-generated-clip` (merged with `origin/feature/entrega-3-JAME` first)

## Baseline and post-test state of `backend/data/`

`backend/data/` held 111 files before the runs and 111 after. Every run used a scratch `DB_PATH`, a scratch `PROJECTS_ROOT` and a `SECRETS_PATH` pointing at a file that does not exist, so nothing in `backend/data/` was touched and nothing needed restoring.

## Tests

| Run | Result |
|---|---|
| New: `test/clip-output-check.test.ts` (`judgeClip` at every boundary; `checkClip` on real ffmpeg clips, a truncated file, non-MP4 bytes, ffprobe missing) | 17 passed |
| New: `test/clip-check-video-stage.test.ts` (good clip completes; 4 s clip for 8 s retried with its reason and no stored file; budget exhausted fails at `video`; non-MP4 bytes; ffprobe missing is not retryable) | 5 passed |
| New: `test/stub-video-clip.test.ts` (the stub's 7 s clip passes `checkClip` at 7 s and fails at 12 s; one clip per duration) | 2 passed |
| Workflow end to end (real spawned server, every provider stubbed, real clip check) and the packaging tests | 31 passed |
| Full backend suite (`npm run coverage`, final run, includes the new `short-clip` workflow test) | 223 files passed, 6 skipped; 2,973 tests passed, 12 skipped; statements and lines 95.77 % (floor 94 %) |
| `npm run typecheck`, `npm run lint` | clean |
| `test/workflow-stage-failure.test.ts`, new case: `USE_STUB_VIDEO_PROVIDER=short-clip` fails every scene at `video` with the check's reason and never assembles | passed |

Two existing tests changed (task 4.1): `video-stage.test.ts` "a file that is not an MP4" now installs the real check (the rule is part of it) and waits for the retry budget; `persistence.test.ts` lists `clipOutputCheck.ts` among the files that remove a temporary folder.

## The check on the 46 real clips of 2026-10-29

`checkClip` was run read-only on the clips of the real session "How Much in Dividends to Quit Your Job Early" (2026-10-29 22-21), each with the requested duration stored for its scene (a copy of the store was read; no file was written):

```
scene 1: requested 11 s -> accepted
scene 2: requested 14 s -> accepted
scene 3: requested 9 s -> accepted
scene 4: requested 12 s -> accepted
scene 5: requested 9 s -> accepted
scene 6: requested 8 s -> accepted
scene 7: requested 13 s -> accepted
scene 8: requested 13 s -> accepted
scene 9: requested 13 s -> accepted
scene 10: requested 13 s -> accepted
scene 11: requested 10 s -> accepted
scene 12: requested 9 s -> accepted
scene 13: requested 10 s -> accepted
scene 14: requested 11 s -> accepted
scene 15: requested 12 s -> accepted
scene 16: requested 9 s -> accepted
scene 17: requested 11 s -> accepted
scene 18: requested 13 s -> accepted
scene 19: requested 15 s -> accepted
scene 20: requested 13 s -> accepted
scene 21: requested 14 s -> accepted
scene 22: requested 14 s -> accepted
scene 23: requested 13 s -> accepted
scene 24: requested 14 s -> accepted
scene 25: requested 11 s -> accepted
scene 26: requested 14 s -> accepted
scene 27: requested 10 s -> accepted
scene 28: requested 13 s -> accepted
scene 29: requested 10 s -> accepted
scene 30: requested 14 s -> accepted
scene 31: requested 10 s -> accepted
scene 32: requested 10 s -> accepted
scene 33: requested 15 s -> accepted
scene 34: requested 10 s -> accepted
scene 35: requested 13 s -> accepted
scene 36: requested 13 s -> accepted
scene 37: requested 13 s -> accepted
scene 38: requested 6 s -> accepted
scene 39: requested 11 s -> accepted
scene 40: requested 14 s -> accepted
scene 41: requested 12 s -> accepted
scene 42: requested 10 s -> accepted
scene 43: requested 8 s -> accepted
scene 44: requested 9 s -> accepted
scene 45: requested 14 s -> accepted
scene 46: requested 14 s -> accepted

46 of 46 clips accepted
```
