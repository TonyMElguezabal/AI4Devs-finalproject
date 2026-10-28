# Step 1 Report - libass and font gate

- Date: 2026-10-28
- Change: add-burned-in-subtitles (JOS-237)
- Agent: Claude Sonnet 5.5

## 1.2 libass in the ffmpeg builds the product uses
The three pinned `eugeneware/ffmpeg-static` b6.0 builds of `packaging/targets.ts` were downloaded, each into its own scratch folder, and their SHA-256 matched the pins.

| Target | SHA-256 matches | How checked | libass | freetype | `subtitles` filter |
|---|---|---|---|---|---|
| darwin-arm64 | yes | run here: `-filters`, `-buildconf` | `--enable-libass` | `--enable-libfreetype` | listed (`subtitles`, `ass`, `drawtext`) |
| darwin-x64 | yes | binary text only (not run) | `--enable-libass` string, 24 libass strings | `--enable-libfreetype` | filter name present |
| win32-x64 | yes | binary text only (not run) | `--enable-libass` string, 32 libass strings | `--enable-libfreetype` | filter name present |

- ffmpeg 6.0, `--enable-gpl --enable-nonfree` (the existing licence note in ADR 0007 is unchanged).
- Built without `libfontconfig`: libass reads only the `fontsdir` folder, which is what the design wants (a bundled font, never a system one).
- **Outcome: the gate passes. No pinned build needs replacing.** The pinned darwin-arm64 binary is the development `FFMPEG_PATH` (the Homebrew 8.1.2 build has no `subtitles`, `ass` or `drawtext` filter).
- The darwin-x64 and win32-x64 builds could not be run on this machine; their filter was confirmed from the binary only. The first release workflow run on those runners must show the subtitles in a smoke frame (task 5.2).

## 1.3 The font
- Source: https://github.com/JulietaUla/Montserrat (`fonts/ttf/Montserrat-Bold.ttf`, `OFL.txt`), static Bold.
- SHA-256 `Montserrat-Bold.ttf`: `bc6e854971cea46b463be6f9eef4d9cd52f51cfc1fc0dd90c9d3e6483dc0ec61` (454,864 bytes). `OFL.txt`: `8b7141c03fa4f8d44e6345d5d4931709290f0f67875e452e95ac1fd3a027802e`.
- Placed in `backend/assets/fonts/`. SIL Open Font License 1.1, so it can be bundled with its licence.
- Glyphs: `á é í ó ú ñ ü ¿ ¡` rendered correctly in the 1.4 spike frame.

## 1.4 Spike: rendering and size
- Rendered a 3 s clip with a hand-written ASS file through `subtitles=subtitles.ass:fontsdir=fonts`, run with the folder as the working directory (design Decision 4). White text, dark outline 3, bottom-centre, one word in `#FFCDD0`: correct, accents included.
- **Finding 1 - the event format.** The spike's `Format:` line listed 7 fields while each `Dialogue` had 10, so `0,0,,` printed before the text. `renderAss` must use the standard `Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`, and a test must check that every `Dialogue` has as many fields as its `Format`.
- **Finding 2 - the size.** ASS `Fontsize` is not a CSS pixel size. Capital-letter height of the white fill (half-coverage threshold) for the text `HHHH`:

| ASS Fontsize | cap height | note |
|---|---|---|
| 48 | 21 px | what the design first wrote: too small |
| 72 | 32 px | |
| 76 | 34 px | |
| 80 | 36 px | |

  A CSS `48px` Montserrat has a cap height of 0.70 x 48 = 33.6 px. The product owner's "48 px" is the CSS size, so `SUBTITLE_STYLE` uses **`Fontsize: 75`** (about 33.4 px capitals). The real-frame test (task 4.5) asserts a cap height of 33-35 px.

## Outcome
- Step 1 status: PASS. Style constants for the code: Montserrat, Bold, Fontsize 75, outline 3, shadow 0, Alignment 2, MarginV 80, MarginL/R 60, WrapStyle 2, `PlayResX: 1920`, `PlayResY: 1080`, `ScaledBorderAndShadow: yes`.
