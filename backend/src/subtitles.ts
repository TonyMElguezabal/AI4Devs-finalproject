// add-burned-in-subtitles (JOS-237) — the script as subtitle cues: one line of at most MAX_LINE_CHARACTERS, timed from the
// stored per-character narration timestamps and moved with the pause edits exactly as the narration is (design
// Decisions 1 and 2). Pure functions only, so everything here is tested without ffmpeg.

import type { NarrationEdit } from "./assemblyTool.ts";
import type { TimestampCharacter } from "./narrationTimestamps.ts";

/** The product owner's limit (JOS-237): one line, as in the reference image. Spaces count. */
export const MAX_LINE_CHARACTERS = 32;
/** A comma only ends a line early when it leaves at least this many characters, so `Yes,` never stands alone. */
export const MIN_COMMA_BREAK_CHARACTERS = 12;
/** A line stays on screen this long after its last character is spoken, when the next line starts later. */
export const LINGER_SECONDS = 0.5;
/** A line stays on screen at least this long, when the next line allows it. */
export const MIN_CUE_SECONDS = 0.7;

export interface SubtitleWord {
  /** The script's own token, punctuation included (`600,000` is one word). */
  text: string;
  /** When the word's first spoken character starts, in the final video's timeline. */
  startSeconds: number;
}

export interface SubtitleCue {
  startSeconds: number;
  endSeconds: number;
  words: SubtitleWord[];
}

/**
 * Where `seconds` (a time in the stored narration) lands after the pause edits, using the geometry of
 * `buildNarrationFilter`: a negative edit removes `|delta|` centred on `atSeconds`, a positive one inserts `delta` at it.
 * A time inside a removal moves to where the removal begins.
 */
export function shiftTime(seconds: number, edits: readonly NarrationEdit[]): number {
  const ordered = [...edits].filter((edit) => edit.deltaSeconds !== 0).sort((a, b) => a.atSeconds - b.atSeconds);
  let shift = 0;
  for (const edit of ordered) {
    if (edit.deltaSeconds > 0) {
      if (seconds < edit.atSeconds) break;
      shift += edit.deltaSeconds;
    } else {
      const half = -edit.deltaSeconds / 2;
      if (seconds >= edit.atSeconds + half) shift += edit.deltaSeconds;
      else if (seconds > edit.atSeconds - half) return edit.atSeconds - half + shift;
      else break;
    }
  }
  return seconds + shift;
}

interface TimedWord {
  text: string;
  startSeconds: number;
  /** When the word's last spoken character ends. */
  endSeconds: number;
  endsSentence: boolean;
  endsClause: boolean;
}

const isWhitespace = (character: string): boolean => /\s/u.test(character);
const SENTENCE_END = /[.?!…]["'”’)\]]*$/u;
const CLAUSE_END = /[,;:]$/u;

/**
 * The script's words with the times of their first and last spoken characters. Characters are matched to the script by
 * position, ignoring whitespace (forced alignment may not return entries for it), like `sentenceSpeechSpans`.
 */
function timedWords(script: string, characters: readonly TimestampCharacter[]): TimedWord[] {
  const spoken = characters.filter((entry) => !isWhitespace(entry.text));
  const scriptSpoken = script.replace(/\s/gu, "");
  if (spoken.map((entry) => entry.text).join("") !== scriptSpoken) {
    throw new Error("The timestamp characters do not match the script");
  }
  const words: TimedWord[] = [];
  let index = 0;
  for (const token of script.split(/\s+/u).filter((entry) => entry.length > 0)) {
    const length = [...token].length;
    words.push({
      text: token,
      startSeconds: spoken[index]!.start,
      endSeconds: spoken[index + length - 1]!.end,
      endsSentence: SENTENCE_END.test(token),
      endsClause: CLAUSE_END.test(token),
    });
    index += length;
  }
  return words;
}

const lineLength = (words: readonly TimedWord[]): number => words.reduce((sum, word) => sum + word.text.length, 0) + Math.max(0, words.length - 1);

/** Greedy lines: a sentence end ends a line; on overflow, break after the last comma that leaves enough, else before the word. */
function breakIntoLines(words: readonly TimedWord[]): TimedWord[][] {
  const lines: TimedWord[][] = [];
  let current: TimedWord[] = [];

  const push = (word: TimedWord): void => {
    if (current.length > 0 && lineLength([...current, word]) > MAX_LINE_CHARACTERS) {
      let keep = current.length;
      for (let count = current.length - 1; count >= 1; count--) {
        if (current[count - 1]!.endsClause && lineLength(current.slice(0, count)) >= MIN_COMMA_BREAK_CHARACTERS) {
          keep = count;
          break;
        }
      }
      const carried = current.slice(keep);
      lines.push(current.slice(0, keep));
      current = [];
      for (const word of carried) push(word);
      push(word);
      return;
    }
    current.push(word);
    if (word.endsSentence) {
      lines.push(current);
      current = [];
    }
  };

  for (const word of words) push(word);
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * The subtitle cues for `script`, from its per-character `characters`, moved by the pause `edits` and never past
 * `videoSeconds`. A line starts when its first word is spoken and ends at the earliest of: `LINGER_SECONDS` after its
 * last character, the next line's start, and the video's end; it is held to `MIN_CUE_SECONDS` only where the next line
 * allows. Throws when the characters do not match the script.
 */
export function buildSubtitleCues(
  script: string,
  characters: readonly TimestampCharacter[],
  edits: readonly NarrationEdit[],
  videoSeconds: number,
): SubtitleCue[] {
  const lines = breakIntoLines(timedWords(script, characters)).map((line) => ({
    startSeconds: shiftTime(line[0]!.startSeconds, edits),
    lastSpokenSeconds: shiftTime(line[line.length - 1]!.endSeconds, edits),
    words: line.map((word) => ({ text: word.text, startSeconds: shiftTime(word.startSeconds, edits) })),
  }));
  return lines.map((line, index) => {
    const limit = Math.min(index + 1 < lines.length ? lines[index + 1]!.startSeconds : videoSeconds, videoSeconds);
    let endSeconds = Math.min(line.lastSpokenSeconds + LINGER_SECONDS, limit);
    if (endSeconds - line.startSeconds < MIN_CUE_SECONDS) endSeconds = Math.min(line.startSeconds + MIN_CUE_SECONDS, limit);
    return { startSeconds: line.startSeconds, endSeconds, words: line.words };
  });
}

/** The look of the subtitles on the 1920x1080 frame. `fontSize` is ASS units, not CSS pixels: 75 draws a CSS 48 px Montserrat. */
export const SUBTITLE_STYLE = {
  width: 1920,
  height: 1080,
  fontName: "Montserrat",
  fontSize: 75,
  textColour: "FFFFFF",
  highlightColour: "FFCDD0",
  outlineColour: "000000",
  outlineWidth: 3,
  marginSide: 60,
  marginBottom: 80,
} as const;

/** `h:mm:ss.cc`, in centiseconds, as ASS wants it. */
export function assTime(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const wholeSeconds = Math.floor(centiseconds / 100);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const rest = wholeSeconds % 60;
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${hours}:${two(minutes)}:${two(rest)}.${two(centiseconds % 100)}`;
}

/** ASS colours are blue-green-red: `FFCDD0` (red FF, green CD, blue D0) is `D0CDFF`. */
const assColour = (rgb: string): string => `${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`;

/** `{` and `}` would open an override tag and a backslash could start `\N`, so none of them may reach the file as typed. */
function escapeAssText(text: string): string {
  return text.replace(/[\\{}]/g, (character) => (character === "\\" ? "\\\u200B" : `\\${character}`));
}

/**
 * The ASS file for `cues`: one `Dialogue` event per word state, each holding the whole line with only the word being
 * narrated in the highlight colour. An event that would last no time is left out. (The built-in `\k` karaoke tags are
 * not used: they fill words in and leave them coloured, and the product owner wants each word to go back to white.)
 */
export function renderAss(cues: readonly SubtitleCue[]): string {
  const style = SUBTITLE_STYLE;
  const white = `{\\c&H${assColour(style.textColour)}&}`;
  const pink = `{\\c&H${assColour(style.highlightColour)}&}`;
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${style.width}`,
    `PlayResY: ${style.height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.fontName},${style.fontSize},&H00${assColour(style.textColour)},&H00${assColour(style.textColour)},&H00${assColour(style.outlineColour)},&H00${assColour(style.outlineColour)},-1,0,0,0,100,100,0,0,1,${style.outlineWidth},0,2,${style.marginSide},${style.marginSide},${style.marginBottom},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  for (const cue of cues) {
    cue.words.forEach((word, index) => {
      const startSeconds = Math.max(word.startSeconds, cue.startSeconds);
      const endSeconds = Math.min(index + 1 < cue.words.length ? cue.words[index + 1]!.startSeconds : cue.endSeconds, cue.endSeconds);
      if (Math.round(endSeconds * 100) <= Math.round(startSeconds * 100)) return;
      const text = cue.words
        .map((other, position) => (position === index ? `${pink}${escapeAssText(other.text)}${white}` : escapeAssText(other.text)))
        .join(" ");
      events.push(`Dialogue: 0,${assTime(startSeconds)},${assTime(endSeconds)},Default,,0,0,0,,${text}`);
    });
  }
  return [...header, ...events, ""].join("\n");
}
