## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-237-subtitles` exists from `origin/feature/entrega-3-JAME` (at `d74f314a`, PR #139 merged) with no upstream, in the worktree `../AI4Devs-jos-237` (checked by `/opsx:propose`)
- [x] 0.2 `git fetch`. Confirm three things: this is the worktree's current branch, it still has no upstream, and `origin/feature/entrega-3-JAME` has not moved past its base (merge it in if it has). Then run `npm ci` in `backend/` and `frontend/`.

## 1. Gate: libass and the font (design Decisions 4, 6; STOP here if it fails)

- [x] 1.1 Confirm design.md § Context still holds:
  - `buildMuxArguments` is the only place the final mux is built, and the video is already re-encoded with `libx264`;
  - `readStoredCharacters` in `sessionPauses.ts` still reads `narration-timestamps.json`;
  - `sentenceSpeechSpans` still matches characters to the script by position, ignoring whitespace;
  - `packaging/build.ts` still copies `ffmpeg` and `ffprobe` beside the executable.
- [x] 1.2 Check libass in every ffmpeg the product uses:
  - the pinned `eugeneware/ffmpeg-static` b6.0 `darwin-arm64`, `darwin-x64` and `win32-x64` builds from `packaging/targets.ts`: download each into its own new, empty scratch folder, verify its SHA-256 against `targets.ts`, and run `ffmpeg -hide_banner -filters` and `-buildconf`;
  - a macOS development build with libass for `FFMPEG_PATH` (the pinned `darwin-arm64` binary, if it has libass; otherwise record how to install one).
  Record each result in `reports/YYYY-MM-DD-step-1-libass-gate.md`. **If a pinned build lacks libass:** replace it in `targets.ts` (new URL and SHA-256) with a build that has it and update ADR 0007's licence note. **If no usable build exists for a target, stop and report to the user before any subtitle code is written.**
- [x] 1.3 Obtain the static `Montserrat-Bold.ttf` and its `OFL.txt` from the font's upstream repository (JulietaUla/Montserrat), record the source URL and SHA-256 in the report, and place them in `backend/assets/fonts/`. Check that the file has Latin-1 glyphs (`á é í ó ú ñ ü ¿ ¡`).
- [x] 1.4 Spike: with the libass build and that font, render a 3-second black clip with a hand-written ASS file (48 px, outline 3, bottom-centre, one pink word) and extract a frame. Measure the text's height in the frame and record whether `Fontsize: 48` looks as the product owner's image does; adjust `SUBTITLE_STYLE` (design Decision 4) if it does not and record the final numbers.

## 2. Backend: `subtitles.ts`, times and lines (TDD; design Decisions 1, 2)

- [x] 2.1 Write failing tests in `backend/test/subtitles.test.ts`:
  - `shiftTime`: no edits; a time before, at and after an insertion; after a removal; inside a removal (moves to the cut's start, plus earlier shifts); several edits in order.
  - word starts: each word's start is its first non-whitespace character's `start`; characters that do not match the script throw; whitespace in the script or the characters does not shift the match.
  - lines: at most 32 characters; no word split; a sentence end ends the line; a comma break only when it leaves at least 12 characters; a word longer than 32 characters alone; `600,000` stays one word; accents and `¿ ¡` stay intact; the ticket's example script as a fixture.
- [x] 2.2 Create `backend/src/subtitles.ts` with `SubtitleWord`, `SubtitleCue`, `shiftTime` and the first half of `buildSubtitleCues` (words and lines). Fully typed, with no parameter properties or enums (Node strip-only TypeScript). Make 2.1 pass.

## 3. Backend: line timing, highlight events and the ASS text (TDD; design Decisions 1, 4)

- [x] 3.1 Write failing tests in `backend/test/subtitles.test.ts`:
  - line timing: ends at the next line's start or the last character's `end` + 0.5 s, whichever is first; stays at least 0.7 s when the next line allows; never passes `videoSeconds`; the last line ends at or before the video's end;
  - highlight: exactly one active word per instant; a word stays active until the next word starts, across a silence; the last word until the line ends; a zero-length event is dropped;
  - `renderAss`: header values (`PlayResX/Y`, `WrapStyle: 2`), the style line, one `Dialogue` event per word state, `h:mm:ss.cc` times, the colours as BGR (`&HD0CDFF&` for `#FFCDD0`), `{ } \` escaping, and no raw script text outside the events.
- [x] 3.2 Finish `buildSubtitleCues` (timing and the `videoSeconds` cap) and add `renderAss` and `SUBTITLE_STYLE`. Make 3.1 pass.

## 4. Backend: the port, the adapter, the font and the orchestrator (TDD; design Decisions 3, 4, 5)

- [x] 4.1 Write failing tests:
  - `buildMuxArguments`: with cues, the video graph ends `[cat];[cat]subtitles=subtitles.ass:fontsdir=fonts[outv]`; without, the graph and arguments are exactly as today (the existing assertions);
  - the adapter (with a stubbed `execFileSync`-level seam or a recorded argument list): `subtitles: null` → `failed_not_retryable` naming the timestamps; a missing `subtitles` filter → `failed_not_retryable` naming ffmpeg; a missing font file → `failed_not_retryable`; neither message contains script text; the temp folder is removed;
  - the orchestrator: with a tool double, assembly passes cues built from the stored timestamps; with the stored characters missing or not matching the script, it passes `null`; a rebuild with pause edits passes cues shifted by the same edits; a first assembly passes the stored times;
  - `resolveSubtitleFont`: `SUBTITLE_FONT_PATH` wins; otherwise the bundled default.
- [x] 4.2 Add `subtitles?: readonly SubtitleCue[] | null` to `AssemblyInput` in `assemblyTool.ts`; export `readStoredCharacters` from `sessionPauses.ts`; create `config/subtitleFont.ts`.
- [x] 4.3 In `ffmpegAssemblyTool.ts`: add the filter to `buildMuxArguments`; write `subtitles.ass` and copy the font into the temp folder; run the mux with `cwd` set to it; check the `subtitles` filter once and cache the answer; return the not-retryable failures above.
- [x] 4.4 In `orchestrator.ts`: build the cues for every assembly (first, retry, rebuild) with the snapshotted `narrationEdits` and the video's length, and pass them (or `null`). No stored data is written. In `bootstrap.ts`: log a start-up warning when the ffmpeg in use has no `subtitles` filter. Make 4.1 pass.
- [x] 4.5 Real-ffmpeg tests with `describe.skipIf(!haveSubtitleFilter)`, using the committed fixture of `narration-edits.test.ts`: assemble with cues and extract frames at three cue midpoints (the pink word differs between two instants in one line); assemble with pause edits and check the cue appears later by the edit's amount (±1 frame). Skipped, not failed, on a machine without libass (run them with `FFMPEG_PATH` set to the pinned darwin-arm64 build). Also assert that capital letters are 32-35 px tall (a CSS 48 px Montserrat is 33.6 px), that the frame count, resolution and the copied audio stream are unchanged, and that the temp folder is removed. The ffmpeg adapter runs ffmpeg synchronously, so these tests build each video once in a `beforeAll`, yield to the event loop between builds, and extract frames asynchronously: a long blocked stretch makes vitest's worker RPC time out (`Timeout calling "onTaskUpdate"`), which failed CI on a slow runner.

## 5. Packaging: the font embedded in the executable (design Decision 4)

- [x] 5.1 Write failing tests: `buildRuntimeEnvironment` returns `SUBTITLE_FONT_PATH` under the data folder's `runtime/`; a new `embeddedAssets(webDir)` of `packaging/build.ts` (the assets a build embeds) lists `settings.default.json`, `Montserrat-Bold.ttf` and `Montserrat-OFL.txt` next to the `web/` files, and every listed source file exists.
- [x] 5.2 In `packaging/build.ts` (use `embeddedAssets`), `packaging/entry.ts` (write the font and its licence to `runtime/` at every start; fail to start with a clear message when the font is missing from the executable) and `packaging/runtimeEnv.ts` (`SUBTITLE_FONT_PATH`). Make 5.1 pass.
- [x] 5.3 If this machine can run the packager (the build needs the exact Node version in `targets.ts`), build the smoke flavor for `darwin-arm64`, start it on a scratch data folder, and check that the font and licence appear in `runtime/` and that the packaged ffmpeg draws subtitles in a smoke assembly. If it cannot, record why in `reports/` and leave the first release run of the workflow to prove it.

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Review the tests that call `buildMuxArguments`, `createFfmpegAssemblyTool().assemble`, or assert on `AssemblyInput` (`narration-edits.test.ts`, the assembly-phase and rebuild tests). They must pass unchanged, because `subtitles` is optional. Update a test only where this change intends new behaviour, and record each change in the report.

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline. The worktree has no local database; every run uses scratch `DB_PATH` and `PROJECTS_ROOT`. Record that `data/projects` of the main checkout is not touched.
- [x] 7.2 Run the targeted tests from groups 2-5.
- [x] 7.3 Run the full backend suite (scratch paths), `npm run lint` and the type check in `backend/`. Run the frontend suite as a regression check (no frontend change is expected).
- [x] 7.4 Verify the post-test state matches the baseline and restore if needed.
- [x] 7.5 Create the report `openspec/changes/add-burned-in-subtitles/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`.
- [x] 7.6 Mark this group complete only after the tests pass and the report exists.

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 This change adds no endpoint. Start the backend on scratch paths with the stub providers of the JOS-235 report and the **real** assembly tool (`FFMPEG_PATH` set to the libass build), and bring a session to `final-video` through the existing endpoints.
- [x] 8.2 Extract frames from the downloaded `final-video` (`GET /sessions/{id}/download/final-video`) at three instants and confirm the subtitle line and the pink word; record the commands and the frames' timestamps.
- [x] 8.3 `POST /sessions/{id}/scenes/{sceneId}/pause` with a new `seconds` for one scene, then `POST /sessions/{id}/final-video/rebuild`: follow the session until `final-video-2.mp4` and confirm the cues after that pause moved by the edit.
- [x] 8.4 Failure path: start the backend with an ffmpeg without libass (the Homebrew one) and confirm a new session's assembly fails as not retryable with the cause naming subtitle support, that no final video is recorded, and that the session read shows the failure.
- [x] 8.5 Document commands and responses in `reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`; remove the scratch data and stop only the processes started here.

## 9. E2E Testing in the Browser (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Open the session from 8.1 in the browser. Confirm the final video is offered, download it from the page, and check with `ffprobe` that it is H.264 with the voice-over's audio stream and 1920×1080 at 30 fps (the existing format guarantee is unchanged).
- [x] 9.2 Use "Rebuild final video" on the page after a pause edit; confirm version 2 appears and its frames show the shifted subtitles.
- [x] 9.3 Save screenshots of two extracted frames (one per scene, English; one Spanish session with `ñ ¿ ¡`); restore the environment and record everything in `reports/YYYY-MM-DD-step-9-e2e-testing.md`.

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 Copy `docs/PRD.md` to `docs/PRD-v1.26.md`. In `docs/PRD.md` (Spanish) make the v1.27 changes: a paragraph in §7.3 (subtitles burned in, one line of at most 32 characters, narrated word highlighted, follow the pause edits), AC25, the status line and the §16 changelog row (product owner, JOS-237, 2026-10-28).
- [x] 10.2 `docs/adr/0005-media-assembly.md`: the subtitles step (filter, ASS, cwd trick, the failure rule). `docs/adr/0007-deployment.md`: libass in the pinned builds (confirmed, no replacement), the font and its licence embedded in the executable and written to the data folder at start, `SUBTITLE_FONT_PATH`.
- [x] 10.3 `docs/data-model.md`: the subtitle file is temporary and not stored; no schema change. `readme.md` (Spanish) and `backend/README.md`: the libass requirement and the `FFMPEG_PATH` / `SUBTITLE_FONT_PATH` notes for development.
- [x] 10.4 Run `graphify update .`.
- [x] 10.5 Commit, then push with an explicit `origin feature/jos-237-subtitles` and open the PR into `feature/entrega-3-JAME` linking JOS-237 (on the user's go-ahead).
