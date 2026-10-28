## Why

The final video carries the narration only as sound. A video watched without sound, as on most social feeds, says nothing, and the User cannot tell at a glance that the words match what is shown. The script is already known and the system already stores a start and end time for every character of the narration, so subtitles need no new provider call and no extra cost (JOS-237).

## What Changes

- **Subtitles are burned into the final MP4** at assembly, on every scene. There is no player, so there is no on/off switch.
- **Text and timing:** the cues are the script's own text, split into **one line of at most 32 characters**. A cue never splits a word and never crosses a sentence end; it prefers to break after `,` `;` `:`. Timing comes from the stored narration timestamps.
- **Word highlight:** the word being narrated is filled `#FFCDD0` and every other word is white. When the narration moves to the next word, the previous one goes back to white.
- **Style:** Montserrat Bold 48 px on the 1920×1080 frame (the ticket proposed 40 px; the product owner chose 48 px on 2026-10-28), white, dark outline, bottom-centre. The same in English and Spanish.
- **Pause edits (JOS-190):** when a rebuild applies the User's pause edits, the cue times shift by the same amounts as the narration, so the subtitles stay in sync.
- **Every assembly gets them:** first assembly, retry, and final-video rebuild. A final video produced before this change is not touched until the User rebuilds it.
- **Never silently without subtitles:** if the subtitles cannot be built (the timestamps cannot be read) or cannot be drawn (ffmpeg without libass, missing font), the assembly attempt fails as not retryable with a clear cause.
- **Bundled font and a libass check:** Montserrat Bold ships with the app (SIL Open Font License). The ffmpeg build must include libass; the local Homebrew build does not, so the gate task checks the builds the app uses before any subtitle code is written.
- PRD v1.27: a paragraph in §7.3, a new acceptance criterion and the changelog.
- **Non-goals:** a separate `.srt` file (decided: burned-in only), a style or on/off choice in the UI, translating subtitles, and re-timing existing final videos.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `final-video-assembly`: adds requirements that the final video shows the script as subtitles with the narrated word highlighted, that the subtitles follow the narration after pause edits, and that an assembly fails, rather than delivering a video without subtitles, when they cannot be built or drawn.

## Impact

- **Backend:**
  - new `backend/src/subtitles.ts` (cues, time shifting and the ASS text, all pure) and `backend/src/config/subtitleFont.ts`;
  - `assemblyTool.ts` (an optional `subtitles` input) and `ffmpegAssemblyTool.ts` (the filter, the temp files and the libass check);
  - `orchestrator.ts` (builds the cues from the stored timestamps and the pause edits);
  - `bootstrap.ts` (start-up warning when ffmpeg has no `subtitles` filter);
  - `readStoredCharacters` in `sessionPauses.ts` is exported for reuse.
- **Assets and packaging:** `backend/assets/fonts/Montserrat-Bold.ttf` and its `OFL.txt`; `packaging/build.ts` and `runtimeEnv.ts` place the font beside the executable and set `SUBTITLE_FONT_PATH`; `packaging/targets.ts` if the pinned ffmpeg builds lack libass.
- **Frontend, API and data:** none. There is no endpoint, field or migration change; the subtitle file is a temporary file of the assembly attempt and is not stored.
- **Docs:** PRD v1.27 (§7.3, AC25, changelog; v1.26 kept as `docs/PRD-v1.26.md`), ADR 0005 (the subtitles step), ADR 0007 (libass and the font in the bundle), `docs/data-model.md`, the Spanish `readme.md` and `backend/README.md` (the `FFMPEG_PATH` note for development).
- **Cost and time:** no provider calls. One filter on the existing re-encode; expect the mux to take a little longer.
