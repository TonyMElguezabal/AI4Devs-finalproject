# JOS-209: Full-size session timing (steps 8.3 to 8.5)

## Run

- Session `01M62HR247Y7RAYGQQS9AHB9M5`, "Should You Sell Your House to Retire Early? Sell vs Rent Math": 1,521 words, 57 scenes, started 2026-10-29 00:42 UTC, final video built 03:57 UTC (3 h 15 min end to end).
- Windows machine, packaged build, real providers (OpenAI, ElevenLabs, Fal.ai, RunningHub), limits from the run's `settings.default.json`: voice 600 s, decomposition 600 s, image 300 s, video 1200 s.
- **Run condition:** `maxSimultaneousRequests.image` was 6 for the whole run (the application was not restarted after the setting was lowered from 200). Image timings and failures describe 6 in flight, not the 200 default. Video concurrency was 3.
- No billing or balance interruption was recorded by the owner (to be confirmed by the owner).
- Source: copy of `vid4you.sqlite` with its `-wal` and `-shm` files (the first copy lacked them and stopped mid-run). Report produced with `node scripts/sessionTimingReport.ts <db> 01M62HR247Y7RAYGQQS9AHB9M5 <settings>` after the script was changed to read image and video attempts from `provider_requests` (design Decision 7).

## Final video probe (acceptance criterion 4)

`ffprobe`: 1920x1080, 30/1 fps, video 613.567 s, audio 613.539 s. The difference of 0.028 s is under one frame (0.033 s).

## Stages

| Stage | Attempts | Timed out | Elapsed s | Slowest success s | Limit s | Margin |
|---|---|---|---|---|---|---|
| voice-over | 1 | 0 | 60 | 60 | 600 | - |
| timestamps | 1 | 0 | 0 | 0 | 5 | - |
| decomposition | 1 | 0 | 116 | 116 | 600 | - |
| image | 244 | 139 | 10310 | 296 | 300 | 1.01 |
| video | 58 | 0 | 11073 | 1261 | 1200 | - |
| assembly | 1 | 0 | 712 | 712 | - | - |

Image and video attempts come from the request log; a transient failure lasting the stage limit is counted as timed out.

## Clips

| Clip | Requested s | Generation s | Attempts | Outcome |
|---|---|---|---|---|
| 2 | 6 | 331 | 1 | success |
| 3 | 12 | 549 | 1 | success |
| 4 | 13 | 1074 | 1 | success |
| 5 | 15 | 704 | 1 | success |
| 6 | 15 | 705 | 1 | success |
| 7 | 8 | 404 | 1 | success |
| 8 | 13 | 1261 | 1 | success |
| 9 | 10 | 436 | 1 | success |
| 10 | 8 | 424 | 1 | success |
| 11 | 10 | 424 | 1 | success |
| 12 | 15 | 663 | 1 | success |
| 13 | 11 | 508 | 1 | success |
| 14 | 7 | 321 | 1 | success |
| 15 | 13 | 540 | 1 | success |
| 16 | 10 | 641 | 1 | success |
| 17 | 11 | 1023 | 1 | success |
| 18 | 13 | 622 | 1 | success |
| 19 | 13 | 600 | 1 | success |
| 20 | 8 | 392 | 1 | success |
| 21 | 8 | 391 | 1 | success |
| 22 | 9 | 392 | 1 | success |
| 23 | 14 | 692 | 1 | success |
| 24 | 9 | 374 | 1 | success |
| 25 | 10 | 589 | 1 | success |
| 26 | 7 | 424 | 1 | success |
| 27 | 14 | 561 | 1 | success |
| 28 | 12 | 603 | 1 | success |
| 29 | 12 | 520 | 1 | success |
| 30 | 15 | 695 | 1 | success |
| 31 | 14 | 610 | 1 | success |
| 32 | 14 | 746 | 1 | success |
| 33 | 9 | 478 | 1 | success |
| 34 | 10 | 602 | 1 | success |
| 35 | 14 | 846 | 1 | success |
| 36 | 13 | 691 | 1 | success |
| 37 | 8 | 320 | 1 | success |
| 38 | 11 | 609 | 1 | success |
| 39 | 8 | 405 | 1 | success |
| 40 | 10 | 425 | 1 | success |
| 41 | 8 | 424 | 1 | success |
| 42 | 11 | 528 | 1 | success |
| 43 | 11 | 420 | 1 | success |
| 44 | 9 | 576 | 1 | success |
| 45 | 11 | 528 | 1 | success |
| 46 | 6 | 363 | 1 | success |
| 47 | 9 | 388 | 1 | success |
| 48 | 10 | 403 | 1 | success |
| 49 | 14 | 618 | 1 | success |
| 50 | 14 | 547 | 1 | success |
| 51 | 10 | 434 | 1 | success |
| 52 | 12 | 442 | 1 | success |
| 53 | 5 | 229 | 1 | success |
| 54 | 10 | 537 | 1 | success |
| 55 | 9 | 436 | 1 | success |
| 56 | 10 | 412 | 2 | success |
| 57 | 15 | 675 | 1 | success |
| 58 | 9 | 374 | 1 | success |


## Reading the tables

- **Image:** 244 attempts for 57 images, 139 of them lasting the full 300 s (counted as timed out). Every scene eventually succeeded, in up to 4 attempts. The slowest success took 296 s, so the margin is 300/296 = 1.01: the limit is not comfortable at all, and the 139 timeouts show many requests are slower than it. Measured at concurrency 6 only.
- **Video:** 58 attempts, one transient failure at 219 s (clip 56, retried and succeeded), no timeout. The slowest success took 1,261 s, above the 1,200 s limit; the three slowest clips (1,261 s, 1,074 s, 1,023 s) were the first three sent, at 01:31:18 UTC. **Open question:** why a request over the limit counted as a success; the owner or the attempt-timeout code must explain it before the margin of 1,200/1,261 is trusted.
- **Single sample:** one run, one script, one afternoon of provider load.

## Draft recommendation (not decided; task 9.1)

- Voice (60 s of 600), decomposition (116 s of 600): keep.
- Video: keep 1,200 s only if the 1,261 s success is explained; otherwise raise it (suggested 1,800 s) through an OpenSpec change.
- Image: 300 s is too tight even at concurrency 6 (139 of 244 attempts hit it, margin 1.01), so raise it through an OpenSpec change. The slowest times are censored at 300 s, so the number needs headroom over what was observed; if the real distribution is wanted, run only the image stage at concurrency 200 with a temporary higher limit (for example 900 s), without paying for video.
