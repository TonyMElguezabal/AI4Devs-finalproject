# `work/` removed (2026-10-20)

The experiment working directory (343 files, about 60 MB of rendered MP4s, M4A voice-overs and ffmpeg logs) was removed from the tree during the MVP closure cleanup (JOS-203, item R1). The decisions and measurements are in `design.md`, `reports/` and `docs/adr/0005-media-assembly.md`; the committed `fixture/` (used by `backend/test/narration-edits.test.ts`) and `scripts/` are kept. The files remain in Git history, last present at commit `b368d1b7`.
