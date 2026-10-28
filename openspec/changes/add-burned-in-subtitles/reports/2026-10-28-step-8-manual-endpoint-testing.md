# Step 8 Report - Manual Endpoint Testing

- Date: 2026-10-28
- Change: add-burned-in-subtitles (JOS-237)
- Agent: Claude Sonnet 5.5

This change adds no endpoint. What was exercised is the existing ones, with the **real** assembly tool.

## Setup and one deviation from the task text
- Backend from this worktree (`node src/server.ts`) on scratch `DB_PATH` and `PROJECTS_ROOT`, ports 3922 and 3923. Real ffmpeg: the pinned darwin-arm64 b6.0 build (`FFMPEG_PATH`, libass) and, for the failure path, the Homebrew 8.1.2 build (no libass).
- **Deviation:** a dev backend has no stub that produces narration timestamps, so the sessions were **seeded** through the application's own functions (`createRun`, `insertVoiceOver`, `insertNarrationTimestamps`, `registerDecomposition`, `launchVideoStageForRun`), as the JOS-235 report did, using the real media of the committed `define-media-assembly` fixture (a 14.4 s narration and real clips). The first assembly then ran through the real adapter. Everything after that (read, download, pause edit, rebuild, retry) went through HTTP endpoints. The packaged smoke run in the step-5 report covers the path from `POST /sessions`.
- The product's 5 s lower bound per scene refused the fixture's 2.4-3 s scenes (`decomposition-failed`), so the same media was regrouped into two 7.2 s scenes: sentences 1-2 (0-7.2 s) and sentences 3-5 (7.2-14.4 s), each character 0.07 s.

## Session A (libass ffmpeg)
| # | Command | Result |
|---|---|---|
| 1 | seed + first assembly | `final-video.mp4`, no failure |
| 2 | backend start | no "no `subtitles` filter" warning |
| 3 | `GET /sessions/A` | state `final-video`, `finalVideo {version 1, pendingPauseEdits false, staleScenes false}` |
| 4 | `GET /sessions/A/download/final-video` | 200, 670,810 bytes; H.264 432 frames, AAC audio, 14.4 s |
| 5 | `POST /sessions/A/scenes/{scene 1}/pause` `{"seconds":1.5}` (original pause about 2.49 s) | 200, scene read back |
| 6 | `POST /sessions/A/final-video/rebuild` | 202 `{"ok":true,"held":false}`; `final-video-2.mp4` next to `final-video.mp4` |
| 7 | `GET .../download/final-video` | 200, 732,687 bytes; 402 frames, 13.4 s (14.4 s minus the removed 1 s) |

Sentence 3 (spoken from 7.2 s in the stored narration) first shows its highlighted word at **7.2 s in version 1 and at 6.2 s in version 2** (sampled every 0.1 s): the subtitles moved with the narration. Frames at 6.9 s: version 1 shows no subtitle, version 2 shows `Then any retirement money now.` with `retirement` pink (`reports/screenshots/pause-edit-v1-at-6.9s-no-subtitle.png`, `pause-edit-v2-at-6.9s-subtitle.png`).

## Session B (ffmpeg without libass)
| # | Command | Result |
|---|---|---|
| 8 | seed + first assembly with the Homebrew ffmpeg | no final video; failure `{phase "assembly", retryable false, manualRetryAvailable true}`, cause: "The final video could not be assembled: the assembly tool has no subtitle support: this ffmpeg was built without libass (set FFMPEG_PATH to a build that has it). Your narration, images and clips are kept." (no script text) |
| 9 | backend start | log: `ffmpeg has no \`subtitles\` filter (built without libass): every assembly will fail until FFMPEG_PATH points at a build that has it` |
| 10 | `GET /sessions/B` | state `failed`; phases voice-over, decomposition, scenes complete, assembly failed; both scenes `chunk-complete`; no `finalVideoUrl` |
| 11 | `GET .../download/final-video` | 409 |
| 12 | project folder | `voice-over.m4a`, `narration-timestamps.json`, `scene-1/2.mp4`, `scene-1/2.png` kept; no `final-video*.mp4` |
| 13 | restart with `FFMPEG_PATH` set to the libass build; `POST /sessions/B/assembly/retry` | 200 `{"ok":true,"held":false}`; session reaches `final-video`; download 200, 670,810 bytes (the same size as session A's version 1); 114 of 144 sampled frames carry a highlighted word |

## Cleanup
Backends stopped by their own PIDs (no listener left on 3922 or 3923); the scratch sessions, projects and videos removed; nothing written to the main checkout's data.

## Outcome
- Step 8 status: PASS
