# Step 7 Report - Manual Testing with Real Providers

- Date: 2026-09-28
- Change: split-sentences-at-clause-boundaries (JOS-141)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-141-split-at-clause-boundaries` at `b2b2f90`

## Setup (task 7.1)

The real server (`node src/server.ts`, port 3199) on a scratch database and scratch projects folder (`DB_PATH`, `PROJECTS_ROOT`); `GET /docs` answered 200. As in JOS-140's own manual test, the decomposition phase has no trigger yet, so a script (kept outside the repository) created each session through `POST /sessions`, made the real ElevenLabs text-to-speech call (voice `4YYIPFl9wE5c4L2eu2Gb`, model `eleven_multilingual_v2`), stored the narration through the project's own store functions, called `runDecompositionPhase` with the real forced-alignment provider (unused here: both scripts got usable native timestamps) and a stub instruction generator, then read `GET /sessions/:id` from the running server.

## Real narration and clause splitting (tasks 7.2 and 7.3)

Designing a script to land specific real sentences on specific sides of the 5 s/15 s thresholds took two attempts in each language: the first attempt's borrowed sentence had a first clause under 5 s (real speech, not the even per-character rate synthetic tests use), giving `[short + first-clause]` a combined duration still below the lower bound with no valid grouping (a genuine "no grouping satisfies the bounds" case, not a bug — confirmed by inspecting the real unit durations directly). Lengthening that first clause in both languages fixed it on the second call.

### English (5 sentences, 62.183 s narrated)

| # | Sentence (start) | Duration | Clause boundaries | Outcome |
|---|---|---|---|---|
| 1 | "The captain paused for a moment." | 2.33 s | 0 | short; borrows into sentence 2 |
| 2 | "Then he looked carefully toward the quiet evening harbor…" | 15.29 s | 3 | free (>15 s) **and** borrowed; all 3 boundaries exposed |
| 3 | "The old lighthouse keeper walked along the rocky shoreline…" | 10.74 s | 3 | whole (AC3): within bounds, stays one fragment despite 3 commas |
| 4 | "The waves crashed loudly against the ancient sea wall…" | 14.87 s | 2 | whole (AC3 again): within bounds, stays one fragment |
| 5 | "The tide slowly rose above the old stone harbor wall…" | 18.95 s | 0 | free, no boundary: flagged `unsplittable-sentence` (AC4) |

Segmentation result: 5 fragments — `[7.76, 9.86, 10.74, 14.87, 18.95]` s, summing to 62.183 s exactly (ffprobe). Fragment 1 is sentence 1 plus the first piece(s) of sentence 2 (AC1+AC2 together, since sentence 2 was both free and borrowed); fragment 2 is the rest of sentence 2. Fragment 5 alone carries `unsplittable-sentence`; no other fragment does. Joined, the fragments equal the script apart from whitespace. `GET /sessions/:id`: `chunks-processing`, 5 chunks, in order. Stub generator called once with 5 texts.

### Spanish (4 sentences, 50.759 s narrated)

| # | Sentence (start) | Duration | Clause boundaries | Outcome |
|---|---|---|---|---|
| 1 | "El capitán se detuvo un momento." | 2.23 s | 0 | short; borrows into sentence 2 |
| 2 | "Después miró con calma hacia el puerto tranquilo…" | 18.76 s | 2 | free **and** borrowed; both boundaries exposed |
| 3 | "El viejo farero caminaba por la costa rocosa…" | 12.15 s | 2 | whole (AC3): stays one fragment |
| 4 | "La marea subió lentamente sobre el viejo muro de piedra…" | 17.62 s | 1 | free: splits at its one boundary into two valid pieces (AC1) |

Segmentation result: 5 fragments — `[7.74, 13.25, 12.15, 5.32, 12.30]` s, summing to 50.759 s exactly. No fragment needed the `unsplittable-sentence` flag in this script (every must-split sentence had a usable boundary). Joined, the fragments equal the script apart from whitespace, accents (`á`, `é`, `í`, `ó`, `ú`, `ñ`) intact. `GET /sessions/:id`: `chunks-processing`, 5 chunks, in order.

Both runs used native timestamps (ElevenLabs returned them for both scripts), so the real forced-alignment provider was configured but not exercised here; it is exercised by JOS-140's own manual test and by `alignment-provider.contract.test.ts`.

## Cleanup and state (task 7.4)

- The server was stopped; the scratch store was emptied with the test-only `resetAll()`: `runs`, `scenes`, `provider_requests`, `scene_results`, `voice_overs`, `stage_attempts`, `narration_timestamps` all 0, all 11 triggers present, 0 project folders left (it held 5 sessions, 14 chunks, 5 narrations before).
- The default test store and `data/projects/` are identical to the step 6 baseline.

## Spend

ElevenLabs only (subscription quota, no incremental charge, no video or image provider calls needed for this step): 4 text-to-speech calls across the two languages (two attempts each, ~2,750 characters total).

## Outcome

- Step 7 status: PASS
- Blocking issues: none
- Note: designing a script that lands a real sentence's *first clause* just above 5 s is sensitive to the voice provider's actual speaking rate, not just character count — worth remembering for any future manual test that needs a specific piece duration.
