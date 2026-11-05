# Step 9 Report - E2E Testing in the Browser

- Date: 2026-10-28
- Change: add-burned-in-subtitles (JOS-237)
- Agent: Claude Sonnet 5.5 (Claude in Chrome)

## Setup
- Backend from this worktree on port 3100 (scratch `DB_PATH` and `PROJECTS_ROOT`, `FFMPEG_PATH` = the pinned darwin-arm64 build with libass, `CORS_ALLOWED_ORIGINS` for 5174) and this worktree's Vite on 5174. Port 5173 belongs to a dev server of the main checkout and was left alone.
- Two sessions seeded as in the step-8 report (real fixture media; first assembly through the real adapter): an English one and a Spanish one (language `es`, with `¿ ¡ ñ á é í ó ú`).
- The telemetry dialog was dismissed with "Not now".

## Scenarios (all PASS)
| # | Action | Result |
|---|---|---|
| 1 | Open `?sessionId=<English>` | all four phases complete; session state "Final video ready"; "Download final video" link to `/sessions/<id>/download/final-video`, labelled "Version 1" |
| 2 | Fetch that link target and probe it (a browser download was not triggered; the file is the same URL) | 200, 670,810 bytes; H.264 1920x1080 at 30 fps, 432 frames, AAC audio: the output format is unchanged |
| 3 | Open "View scene 1 details", set "Pause after scene 1" from 2.49 s to 1.5 s, leave the field | value kept; "Rebuild final video" appears (and "Reset scene 1 pause" is enabled) |
| 4 | Click "Rebuild final video" (the local assembly, not "Rebuild scene 1", which would regenerate paid media) | within 5 s the page shows "Version 2" and "Local assembly (ffmpeg), 2 attempts"; the button disappears |
| 5 | Fetch the link target again | 200, 732,687 bytes; 402 frames, 13.4 s (the 1 s removed) |
| 6 | Frame of version 2 at 6.9 s (`reports/screenshots/e2e-english-v2-at-6.9s.png`) | `Then any retirement money now.` with `retirement` pink: the third sentence is already on screen at 6.9 s, where version 1 shows none |
| 7 | Spanish session, frames at 3.0 s and 12.5 s (`e2e-spanish-at-3.0s.png`, `e2e-spanish-at-12.5s.png`) | `¡Que dure muchos años!` with `muchos` pink, and `Después, ¿qué más?`: `¡ ñ é ¿` all drawn correctly; the line breaks after the sentence-ending `?` |

## Cleanup
Tab closed; backend and Vite stopped by their own PIDs (nothing left on 3100 or 5174, the 5173 server still running); scratch sessions removed; nothing written to the main checkout's data.

## Outcome
- Step 9 status: PASS
