## Context

- The final video is assembled by `createFfmpegAssemblyTool` (`backend/src/ffmpegAssemblyTool.ts`). Stage 1 retimes and normalises each clip; stage 2 concatenates them and muxes the narration in one `ffmpeg` run, built by `buildMuxArguments`. The video is already re-encoded there (`libx264`), so a filter on it adds no pass.
- The orchestrator (`orchestrator.ts`, about L597-667) calls `tool.assemble(...)` for a first assembly, a retry and a rebuild. For a rebuild it has the pause edits as `narrationEdits: NarrationEdit[]` (`{ atSeconds, deltaSeconds }`, in the stored timeline).
- The narration's per-character timestamps are stored in `narration-timestamps.json` (`{ mechanism, characters: [{ text, start, end }] }`). `sessionPauses.ts` already reads them with `readStoredCharacters` (not exported) and `sentenceTimings.ts` matches characters to the script by position, ignoring whitespace, and throws when they do not match.
- A real session always has timestamps by the time it reaches assembly (they are a precondition of decomposition, PRD §6). About 20 existing test files drive assembly with a stub `AssemblyTool` and no stored timestamps, on purpose.
- ffmpeg: the local Homebrew 8.1.2 has no `subtitles`, `ass` or `drawtext` filter. The packaged builds are the pinned `eugeneware/ffmpeg-static` b6.0 (`packaging/targets.ts`); whether they include libass is not recorded anywhere and must be checked.
- Packaging: `packaging/build.ts` writes `ffmpeg` and `ffprobe` beside the executable, and `runtimeEnv.ts` points `FFMPEG_PATH` and `FFPROBE_PATH` at them.

## Goals / Non-Goals

**Goals:**
- One-line, 32-character subtitles with the narrated word highlighted, burned into every assembled video, following pause edits.
- No provider call, no schema change, no API change.
- Never deliver a video that should have subtitles and does not.

**Non-Goals:**
- A sidecar `.srt`/`.vtt`, a per-session or per-user choice, a style editor, translation, or changing finished videos.
- Using speech recognition: the text is the script.

## Decisions

### 1. The cues are built by pure functions in `subtitles.ts`

`buildSubtitleCues(script, characters, edits, videoSeconds): SubtitleCue[]`, with `SubtitleCue = { startSeconds, endSeconds, words: SubtitleWord[] }` and `SubtitleWord = { text, startSeconds }`. `renderAss(cues): string` writes the file. Both are pure, so they are unit-tested without ffmpeg.

- **Words.** The script is split on whitespace. A word's start is the `start` of its first non-whitespace character, found with the same position-matching rule as `sentenceSpeechSpans` (spoken characters are matched to the script ignoring whitespace; a mismatch throws, which becomes "timestamps do not match the script"). A word's own `end` is its last character's `end`.
- **Lines.** Greedy, left to right, keeping a line at 32 characters or fewer (spaces count):
  1. a word ending a sentence (`.`, `?`, `!`, `…`, optionally followed by closing quotes or brackets) ends its line;
  2. when the next word would overflow, break at the last word of the line that ends in `,` `;` `:` if that leaves at least 12 characters, otherwise break before the overflowing word;
  3. a single word longer than 32 characters sits alone on its line.
  The 12-character floor stops a comma from leaving a tiny line such as `Yes,`; the number is a constant to tune after watching real videos.
- **Timing.** A line starts at its first word's start. It ends at the earlier of the next line's start and its last character's `end` + 0.5 s, but stays at least 0.7 s when the next line allows it, and never passes `videoSeconds`.
- **Highlight events.** Word *i* of a line is highlighted from its start until word *i+1* starts; the last word until the line ends. Each state is one ASS `Dialogue` event holding the whole line, with `{\c&HD0CDFF&}` on the active word and `{\c&HFFFFFF&}` back after it. Events that last 0 s (two words that collapse to the same time after a cut) are dropped. The built-in `\k` karaoke tags are not used: they fill words in and leave them coloured, and the product owner wants each word to go back to white.

Alternative rejected: ffmpeg `drawtext` per word. It needs the text escaped for the filtergraph, one filter per word, and does not wrap or outline as reliably as libass.

### 2. Pause edits move the times with one function

`shiftTime(t, edits)` returns where original time `t` lands after the edits, using the same geometry as `buildNarrationFilter`: a negative edit removes `|delta|` centred on `atSeconds` (the cut is `[at − h, at + h]`, `h = |delta| / 2`), a positive edit inserts `delta` at `atSeconds`.

- `t` after an insertion at `a` (that is, `t ≥ a`) moves by `+delta`.
- `t ≥ a + h` after a removal moves by `delta` (negative).
- `t` inside a removal moves to the cut's start, `a − h`, plus the shifts before it.
- Edits are sorted by `atSeconds`; overlapping edits are already refused by `buildNarrationFilter`.

Every word start and every line end goes through it. Because `buildSubtitleCues` receives the edits, it and the audio filter cannot disagree about where the narration moved.

### 3. The orchestrator passes cues; the ffmpeg adapter renders or fails

`AssemblyInput` gets `subtitles?: readonly SubtitleCue[] | null`:

- absent: no subtitles requested (every existing stub-based test, and the existing real-ffmpeg tests, keep working unchanged);
- `null`: the orchestrator could not build them;
- an array: render these.

The orchestrator always sets it. It reads the script and the stored characters once (an exported `readStoredCharacters`), builds the cues with the snapshotted `narrationEdits` and the video's length, and passes `null` when the characters are missing, unreadable or do not match the script. The real adapter turns `null` into `failed_not_retryable`: "the subtitles could not be built: the narration's timestamps could not be read". The stub ignores the field, so the strict rule lives where subtitles are really drawn.

Alternative rejected: failing in the orchestrator. That would break about 20 test files that complete scenes at the store level with no timestamps, for no product gain, since a real session always has them.

### 4. The adapter writes the ASS file next to a copy of the font, and runs ffmpeg inside that folder

In its existing temp `work` folder the adapter writes `subtitles.ass` and copies the font to `fonts/`, then runs the mux with `cwd: work` and the video graph `...concat=...[cat];[cat]subtitles=subtitles.ass:fontsdir=fonts[outv]`. Because both paths are relative and plain, no path needs filtergraph escaping, which removes the Windows drive-letter and quoting problems for free. The other inputs stay absolute arguments. The temp folder is removed in the existing `finally`, so nothing is stored.

The font is a bundled file, never a system font. `config/subtitleFont.ts` resolves it: `SUBTITLE_FONT_PATH` if set, otherwise `assets/fonts/Montserrat-Bold.ttf` relative to the backend source. The packaged app sets `SUBTITLE_FONT_PATH` beside the executable, the way it sets `FFMPEG_PATH`.

The ASS style (`PlayResX: 1920`, `PlayResY: 1080`, `ScaledBorderAndShadow: yes`):

- `Fontname: Montserrat`, `Bold: -1`, `Fontsize: 75`, primary `&H00FFFFFF`, outline `&H00000000`, `Outline: 3`, `Shadow: 0`, `Alignment: 2` (bottom-centre), `MarginL`/`MarginR: 60`, `MarginV: 80`, `WrapStyle: 2` (no automatic wrapping, so a line is one line).
- ASS `Fontsize` is not a CSS pixel size: `Fontsize: 48` renders capitals 21 px tall, while a CSS `48px` Montserrat has 33.6 px capitals. The product owner's "48 px" is the CSS size, so the style uses `Fontsize: 75` (about 33.4 px capitals, measured in task 1.4, `reports/2026-10-28-step-1-libass-gate.md`).
- The events use the standard 10-field format (`Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`); a test checks that every `Dialogue` has as many fields as the `Format` line.
- Text escaping: `{` and `}` become `\{` and `\}`, and a backslash is followed by U+200B so it cannot form `\N`, `\n` or `\h`. A script cannot restyle or hide its own subtitles.

### 5. The adapter checks for the filter before it starts

When `subtitles` is not `undefined`, the adapter first checks that the ffmpeg in use lists the `subtitles` filter (`ffmpeg -hide_banner -filters`, run once and remembered). If not, or if the font file does not exist, it returns `failed_not_retryable` with that cause. `bootstrap.ts` runs the same check at start-up and logs a warning, so a development machine with the wrong ffmpeg finds out at launch, not at the first assembly.

### 6. A gate comes before any subtitle code

Task 1 confirms that the ffmpeg builds the product uses have libass: a development build with libass for `FFMPEG_PATH`, and the three pinned release builds. If the pinned builds lack it, they are replaced in `targets.ts` (new URL and SHA-256) before the story goes on, and ADR 0007's licence note is updated. If no usable build exists, the change stops there, before writing subtitle code.

### 7. No schema, API or UI change

The cues are rebuilt from stored data on every assembly, so nothing new is stored and nothing is added to the session read. The page shows no control. The existing "Rebuild final video" action (JOS-190, JOS-235) is how a User gets subtitles on a video made earlier.

## Risks / Trade-offs

- **ffmpeg without libass in a release build.** → The gate (Decision 6) and the start-up warning. A video is never delivered without subtitles; the cause tells the owner what to fix.
- **Timestamps that do not match the script** (forced alignment can drop or alter characters). → The same position-matching rule and the same error as the decomposition; the assembly fails with a clear cause instead of showing wrong text.
- **Highlight drift of one frame.** → Times are rounded to ASS centiseconds (10 ms), well under a frame at 30 fps (33 ms); the acceptance check is ±1 frame.
- **Rebuild time.** One filter on the existing re-encode. The real-ffmpeg check records the before and after times of a stub assembly.
- **Licence.** Montserrat is OFL: the font file ships with `OFL.txt`. libass is ISC. The existing GPL/nonfree note on the pinned ffmpeg is unchanged.
- **Font weight on a variable font.** The repository keeps only a static `Montserrat-Bold.ttf`, so libass picks Bold without relying on variable-font instances.

## Migration Plan

None. No data changes. Videos already produced stay as they are; rebuilding the final video produces the subtitled version. Rollback is reverting the change.

## Open Questions

None. Colour, size, cue length and the sidecar file were decided by the product owner on 2026-10-28 (JOS-237).
