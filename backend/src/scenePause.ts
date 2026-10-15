import type { NarrationEdit } from "./assemblyTool.ts";
import { SPEED_FACTOR_LIMIT } from "./config/providers.ts";
import type { TimestampCharacter } from "./narrationTimestamps.ts";
import type { Sentence } from "./sentences.ts";
import { sentenceSpeechSpans } from "./sentenceTimings.ts";
import type { NarrationInterval } from "./types.ts";

// adjust-scene-pause (JOS-190) — the pause after a scene, derived from locked data (design Decision 1), and the
// range the User may move it within (design Decision 2). Nothing here is stored and nothing locked is touched.

/** Product owner decision, 2026-10-15: the least silence an edited pause may keep, so the next sentence never lands on the last word. */
export const PAUSE_FLOOR_SECONDS = 0.2;
/** Product owner decision, 2026-10-15: JOS-142's "starts dragging" mark, so lengthening can never create the problem the dial fixes. */
export const PAUSE_CAP_SECONDS = 3.0;
/** Product owner decision, 2026-10-15: the dial's step. */
export const PAUSE_STEP_SECONDS = 0.1;

const EPSILON = 1e-6;
const isWhitespace = (character: string): boolean => /\s/u.test(character);
const roundToMillisecond = (seconds: number): number => Math.round(seconds * 1000) / 1000;
const snapToStep = (seconds: number): number => Math.round(seconds / PAUSE_STEP_SECONDS) / (1 / PAUSE_STEP_SECONDS);

/** The part of a scene `derivePauses` reads; every stored scene has these. */
export interface PauseScene {
  id: string;
  index: number;
  /** PRD §3 `PROMPT`: the fragment of the script the scene narrates, verbatim up to whitespace. */
  prompt: string;
  narrationInterval: NarrationInterval | null;
}

/**
 * Locates `fragment` in `script` at or after `from`, comparing only non-whitespace characters (whitespace is the only
 * difference registration allows between the joined prompts and the script, §4.2). Returns the span's UTF-16 offsets.
 */
function locateFragment(script: string, fragment: string, from: number): { start: number; end: number } | null {
  const wanted = [...fragment].filter((character) => !isWhitespace(character));
  if (wanted.length === 0) return null;
  const characters = [...script];
  // UTF-16 offset of each code point, so spans line up with `sentenceSpeechSpans`.
  const offsets: number[] = [];
  let offset = 0;
  for (const character of characters) {
    offsets.push(offset);
    offset += character.length;
  }
  for (let first = 0; first < characters.length; first++) {
    if (offsets[first]! < from || isWhitespace(characters[first]!)) continue;
    let matched = 0;
    let last = first;
    for (let position = first; position < characters.length && matched < wanted.length; position++) {
      const character = characters[position]!;
      if (isWhitespace(character)) continue;
      if (character !== wanted[matched]) break;
      matched++;
      last = position;
    }
    if (matched === wanted.length) return { start: offsets[first]!, end: offsets[last]! + characters[last]!.length };
  }
  return null;
}

/**
 * The silence after each scene, in seconds: its interval's end minus the end of its last spoken character (the last
 * scene's interval ends at the voice-over's end, D11). A scene with no `PROMPT`, no interval, or that cannot be located
 * is simply absent from the result; timestamps that do not match the script yield an empty result rather than an error,
 * so a legacy or hand-made session still reads.
 */
export function derivePauses(script: string, scenes: readonly PauseScene[], characters: readonly TimestampCharacter[]): Map<string, number> {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const located: Array<{ scene: PauseScene; sentence: Sentence; interval: NarrationInterval }> = [];
  let cursor = 0;
  for (const scene of ordered) {
    if (!scene.narrationInterval) continue;
    const span = locateFragment(script, scene.prompt, cursor);
    if (!span) continue;
    located.push({
      scene,
      interval: scene.narrationInterval,
      sentence: { text: script.slice(span.start, span.end), start: span.start, end: span.end },
    });
    cursor = span.end;
  }
  if (located.length === 0) return new Map();

  let spans;
  try {
    spans = sentenceSpeechSpans(script, located.map((entry) => entry.sentence), characters);
  } catch {
    return new Map();
  }
  const pauses = new Map<string, number>();
  for (const [position, entry] of located.entries()) {
    pauses.set(entry.scene.id, Math.max(0, roundToMillisecond(entry.interval.endSeconds - spans[position]!.end)));
  }
  return pauses;
}

/** What the dial may be set to for one scene. All values in seconds. */
export interface PauseRange {
  originalSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  /** Whether the speed-factor limit, not the 0.2 s floor or the 3.0 s cap, set either bound. */
  limitedBySpeedFactor: boolean;
}

/**
 * Design Decision 2. `clipSeconds` is the clip's requested duration (C), `speechSeconds` the scene's speech share (S,
 * interval length minus original pause). The pause keeps the new interval, S + pause, within [C / limit, C * limit], so
 * the unsigned speed factor stays at or under `SPEED_FACTOR_LIMIT`. The range always includes the original pause (reset
 * must be possible), and for a scene already over the limit it never allows an edit that would make it worse.
 */
export function pauseRange(input: { clipSeconds: number; speechSeconds: number; originalSeconds: number }): PauseRange {
  const { clipSeconds, speechSeconds, originalSeconds } = input;
  const speedFloor = clipSeconds / SPEED_FACTOR_LIMIT - speechSeconds;
  const speedCap = SPEED_FACTOR_LIMIT * clipSeconds - speechSeconds;
  const cap = Math.max(PAUSE_CAP_SECONDS, originalSeconds);
  const floorCandidate = Math.max(PAUSE_FLOOR_SECONDS, speedFloor);
  const capCandidate = Math.min(cap, speedCap);
  return {
    originalSeconds,
    // Rounded inward to the 0.1 s grid so each shown bound is itself an allowed value.
    minSeconds: Math.min(snapToStep(Math.ceil(floorCandidate / PAUSE_STEP_SECONDS - EPSILON) * PAUSE_STEP_SECONDS), originalSeconds),
    maxSeconds: Math.max(snapToStep(Math.floor(capCandidate / PAUSE_STEP_SECONDS + EPSILON) * PAUSE_STEP_SECONDS), originalSeconds),
    limitedBySpeedFactor: speedFloor > PAUSE_FLOOR_SECONDS + EPSILON || speedCap < cap - EPSILON,
  };
}

/** True for the scene's original pause (even off the grid) and for 0.1 s grid values inside its range. */
export function isAllowedPause(range: PauseRange, seconds: number): boolean {
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(seconds - range.originalSeconds) < EPSILON) return true;
  const steps = seconds / PAUSE_STEP_SECONDS;
  if (Math.abs(steps - Math.round(steps)) > EPSILON) return false;
  return seconds >= range.minSeconds - EPSILON && seconds <= range.maxSeconds + EPSILON;
}

export interface PauseEditedScene {
  id: string;
  index: number;
  narrationInterval: NarrationInterval | null;
  /** The scene's derived pause (`derivePauses`); null when none can be derived, and such a scene cannot be edited. */
  originalPauseSeconds: number | null;
}

export interface PauseEditResult {
  /** Each editable scene's interval in the edited narration; the stored intervals are never written. */
  intervals: Map<string, NarrationInterval>;
  /** One entry per scene whose pause really changed, in scene order. */
  edits: NarrationEdit[];
  /** The edited narration's length: the voice-over's plus every change. */
  durationSeconds: number;
}

/**
 * Design Decision 4 — the effective intervals once the pauses in `edited` (scene id → new pause) are applied. Scene i's
 * change is `new − original`; its interval's end moves by every change up to and including its own, its start by every
 * change before it. The shift is accumulated once and added to the stored boundary, so a stored boundary shared by two
 * neighbours stays bit-identical and the result still passes the exact partition check.
 */
export function applyPauseEdits(
  scenes: readonly PauseEditedScene[],
  edited: ReadonlyMap<string, number>,
  voiceOverDurationSeconds: number,
): PauseEditResult {
  const ordered = scenes.filter((scene) => scene.narrationInterval !== null).sort((a, b) => a.index - b.index);
  const intervals = new Map<string, NarrationInterval>();
  const edits: NarrationEdit[] = [];
  let shift = 0;
  for (const scene of ordered) {
    const interval = scene.narrationInterval!;
    const newPause = edited.get(scene.id);
    const original = scene.originalPauseSeconds;
    const delta = newPause === undefined || original === null || Math.abs(newPause - original) < EPSILON ? 0 : newPause - original;
    const startShift = shift;
    shift += delta;
    intervals.set(scene.id, { startSeconds: interval.startSeconds + startShift, endSeconds: interval.endSeconds + shift });
    if (delta !== 0 && original !== null) edits.push({ atSeconds: interval.endSeconds - original / 2, deltaSeconds: delta });
  }
  return { intervals, edits, durationSeconds: voiceOverDurationSeconds + shift };
}
