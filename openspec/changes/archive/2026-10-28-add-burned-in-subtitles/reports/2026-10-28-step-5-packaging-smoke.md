# Step 5 Report - Packaging and the packaged smoke run

- Date: 2026-10-28
- Change: add-burned-in-subtitles (JOS-237)
- Agent: Claude Sonnet 5.5

## What changed (design Decision 4, revised)
The font is **embedded in the executable** and written to the data folder at every start, like the settings defaults, instead of being placed beside the executable (the first design). Reason: the repo already embeds its assets that way, the release archive stays as it is, and the font cannot be separated from the executable it belongs to. design.md, proposal.md and tasks.md were updated before the code.

- `packaging/build.ts`: new `embeddedAssets(webDir)` lists the web build, `settings.default.json`, `Montserrat-Bold.ttf` and `Montserrat-OFL.txt`; `buildTarget` uses it.
- `packaging/entry.ts`: writes the font and its licence to `<data folder>/runtime/` at every start; refuses to start with "the subtitle font is missing from the executable" if they are not embedded.
- `packaging/runtimeEnv.ts`: `SUBTITLE_FONT_PATH` = `<data folder>/runtime/Montserrat-Bold.ttf`.
- Tests: `packaging-runtime-env.test.ts` (existing expectation gained `SUBTITLE_FONT_PATH`: an intended change) and `packaging-build.test.ts` (`embeddedAssets`). All six packaging test files pass (32 tests).

## 5.3 Packaged smoke run (darwin-arm64, this machine)
Node is exactly `v26.4.0`, so the packager could run. `npm run package:smoke` built `backend/dist-package/darwin-arm64-smoke` with the project's own pinned, SHA-256-checked downloads (Node, ffmpeg b6.0, ffprobe b6.0).

1. Started `./Vid4You` with `VID4YOU_DATA_DIR` (scratch), `VID4YOU_PORT=3921`, `VID4YOU_NO_BROWSER=1`.
2. `runtime/` held `Montserrat-Bold.ttf` (454,864 bytes, SHA-256 `bc6e85...c61`, identical to the source file), `Montserrat-OFL.txt` and `settings.default.json`. The start-up log carried no libass warning, so the bundled ffmpeg has the `subtitles` filter.
3. `POST /sessions` with a two-sentence English script. The session reached `final-video` with all four phases complete and no failure. The smoke stubs store character timestamps, so the real cue builder, the real adapter and the **bundled** ffmpeg all ran.
4. `GET /sessions/{id}/download/final-video`: 200, 83,762 bytes; `ffprobe`: H.264 1920x1080 at 30 fps, MP3 audio stream, 1.000 s.
5. Frames (`reports/screenshots/packaged-smoke-frame-*.png`):
   - 0.15 s: `Daniel does not need this 401k` (30 characters; adding "to" would make 33), the word `not` in pink, the rest white, dark outline, bottom-centre, over a busy test pattern.
   - 0.80 s: the second sentence alone, `He needs it to bridge him.`, with `to` in pink.

## Cleanup
App stopped by its PID (no listener left on 3921); the built `dist-package/darwin-arm64-smoke` folder removed (git-ignored anyway); the scratch data removed. Only this machine's darwin-arm64 build was exercised: the darwin-x64 and win32-x64 builds carry libass according to the step-1 gate, and the first release workflow run proves them (its smoke assembly now needs subtitles to succeed).

## Outcome
- Step 5 status: PASS
