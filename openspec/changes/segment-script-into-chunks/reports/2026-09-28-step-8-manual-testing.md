# Step 8 Report - Manual Testing with Real Providers

- Date: 2026-09-28
- Change: segment-script-into-chunks (JOS-140)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-140-segment-script` at `78fa9b4` (after the rule change below)

## Setup (task 8.1)

The real server (`node src/server.ts`, port 3199) on a scratch database and scratch projects folder (`DB_PATH`, `PROJECTS_ROOT`); `GET /docs` answered 200 and `POST /sessions` 201. The decomposition phase has no trigger yet, so a script (kept outside the repository) created each session through the running server's `POST /sessions`, made the real text-to-speech call, stored the narration through the project's own store functions, called `runDecompositionPhase` with the real forced-alignment provider and a stub instruction generator, then read `GET /sessions/:id` from the running server. Credentials came from the local secrets file through `loadCredential`.

## Real narration and decomposition (tasks 8.2 and 8.3)

Voice `4YYIPFl9wE5c4L2eu2Gb`, model `eleven_multilingual_v2` (the recorded values); each narration one real call (7-12 s).

| Case | Script | Timestamps | Narration | Result | Fragments (narrated s) |
|---|---|---|---|---|---|
| English, forced alignment | 779 characters, 13 sentences ("Mr." included) | none stored: the real alignment provider was called | 55.217 s | 5 chunks, `chunks-processing` | 8.650, 7.470, 11.330, 13.870, 13.897 |
| Spanish, native | 646 characters, 12 sentences (`¿`, `¡`, "Sra.", accents) | native | 50.712 s | 4 chunks, `chunks-processing` | 11.389, 12.330, 12.829, 14.164 |
| English, sentence over 15 s | 613 characters, 3 sentences, the middle one 405 characters | native | 44.815 s | 3 chunks, `chunks-processing` | 8.534, **30.012 (`unsplittable-sentence`)**, 6.270 |

For each: every fragment 5-15 s except the flagged one; the durations add up to the MP3's measured duration (ffprobe) exactly; the fragments joined equal the script apart from whitespace; `GET /sessions/:id` showed `chunks-processing` and the same number of chunks; the stub generator was called once.

### Finding: the first rule failed on real narration

The first run of the English and Spanish cases ended `failed` in phase `decomposition`: "no grouping of the script's sentences satisfies the duration bounds". The unit tests had not shown it because their sentences were 5 s or longer. Measured sentence shares of the two real narrations:

- English: 2.9, 5.0, 7.2, 4.0, 4.9, 3.1, 3.4, 2.9, 4.7, 3.2, 4.6, 5.2, 4.1 s
- Spanish: 3.9, 3.7, 3.7, 4.4, 4.3, 3.6, 4.1, 5.3, 4.0, 5.7, 3.8, 5.7 s

Real speech gives sentences of 3-5 s, so the rule "a fragment may not end on a sentence under 5 s unless it is the script's last" left almost no grouping. The product owner was shown the timings of a real narration of their own prompt (two sentences, 10.31 s, one 10 s clip under every rule) and the three rules on these measured scripts, and chose **prefer, but allow**: fragments ending on a short sentence are allowed, counted, and minimised before the speed change. On the English script this gives 5 fragments with 2 ending short and a total speed change of 0.062, against 3 ending short and 0.052 for the smallest speed change alone. The spec (short-sentence requirement, a new scenario with the measured durations, the selection order), design Decision 4 and the tasks were amended first, the code second (commits `9c96eee`, `83e0af6`), step 7 was redone (commit `78fa9b4`), and this step's English and Spanish cases were rerun on new sessions; the table above is the rerun. The long-sentence case passed on both runs.

## Admitted durations (task 8.4)

One reference image, one call to Fal.ai `fal-ai/flux/dev` at 1920x1088 (HTTP 200, 9.6 s, returned 1920x1088). It was uploaded to RunningHub and used for both clips through `POST /openapi/v2/minimax/hailuo-h3/image-to-video` (`resolution: 768P`).

| Requested | Result | Measured (ffprobe) | Provider cost |
|---|---|---|---|
| 8 s | accepted, 214 s | 8.000 s (192 frames at 24 fps, audio 8.000 s), 1344x768 | $0.616 |
| 11 s | accepted, 392 s | 11.542 s (277 frames at 24 fps, audio 11.542 s), 1344x768 | $0.847 |

Both values are accepted, so `VIDEO_ADMITTED_DURATIONS_SECONDS` stays 5-15 whole seconds; its provenance comment now states that 5, 8, 11 and 15 were verified with real calls (5 and 15 in JOS-165). **The provider does not return exactly the requested length:** 5 s gave 5.17 s and 15 s gave 15.08 s (JOS-165), 11 s gave 11.54 s (+0.54 s), 8 s exactly 8.000 s. Assembly (JOS-147, JOS-182) must use each clip's measured duration, not the requested one, when it computes the speed adjustment. Recorded on those two tickets.

## Spend

- RunningHub: $1.463 (8 s $0.616, 11 s $0.847), itemised by the provider
- Fal.ai: 1 image
- ElevenLabs (subscription quota, no incremental charge): 7 text-to-speech calls (3 first-run cases, 2 reruns, 2 short examples for the product owner, about 3,950 characters) and 2 forced-alignment calls
- OpenAI: none (the instruction generator was a stub)

## Cleanup and state (task 8.5)

- The server was stopped; the scratch store was emptied with the test-only `resetAll()`: `runs`, `scenes`, `provider_requests`, `scene_results`, `voice_overs`, `stage_attempts`, `narration_timestamps` all 0, all 11 triggers present (same as the default store), 0 project folders left (it held 6 sessions, 12 chunks, 5 narrations before).
- The default test store and `data/projects/` are identical to the step 7 baseline.

## Outcome

- Step 8 status: PASS (after the rule change above)
- Blocking issues: none
- Open: for JOS-147 and JOS-182, clips arrive at 5.17-15.08 s for the requested 5-15 s; use measured durations
