import { describe, expect, it } from "vitest";
import {
  PAUSE_CAP_SECONDS,
  PAUSE_FLOOR_SECONDS,
  PAUSE_STEP_SECONDS,
  applyPauseEdits,
  derivePauses,
  isAllowedPause,
  pauseRange,
} from "../src/scenePause.ts";
import { findIntervalPartitionProblem } from "../src/intervalPartition.ts";
import type { TimestampCharacter } from "../src/narrationTimestamps.ts";
import type { NarrationInterval } from "../src/types.ts";

// adjust-scene-pause (JOS-190), group 2 — design Decisions 1 and 2. A scene's pause is derived from locked data
// (its interval, its PROMPT, the stored character timestamps), never stored; its allowed range keeps the
// scene's clip within the speed-factor limit.

interface NarratedScene {
  id: string;
  index: number;
  prompt: string;
  narrationInterval: NarrationInterval | null;
}

const SPEECH_STEP = 0.1;

/**
 * Narrates `sentences` one after another, 0.1 s per non-whitespace character, with `pauses[i]` seconds of silence after
 * sentence i. Intervals follow D11 (the previous scene absorbs the silence after it): each starts where its speech
 * starts, the first at 0, and the last ends where the narration ends.
 */
function narrate(sentences: string[], pauses: number[], separator = " ") {
  const characters: TimestampCharacter[] = [];
  const speech: Array<{ start: number; end: number }> = [];
  let clock = 0;
  for (const [index, sentence] of sentences.entries()) {
    const start = clock;
    for (const character of sentence) {
      if (/\s/u.test(character)) continue;
      characters.push({ text: character, start: clock, end: clock + SPEECH_STEP });
      clock += SPEECH_STEP;
    }
    speech.push({ start, end: clock });
    clock += pauses[index] ?? 0;
  }
  const duration = clock;
  const scenes: NarratedScene[] = sentences.map((prompt, index) => ({
    id: `scene-${index + 1}`,
    index: index + 1,
    prompt,
    narrationInterval: {
      startSeconds: index === 0 ? 0 : speech[index]!.start,
      endSeconds: index === sentences.length - 1 ? duration : speech[index + 1]!.start,
    },
  }));
  return { script: sentences.join(separator), characters, scenes, speech, duration };
}

describe("derivePauses (design Decision 1)", () => {
  it("derives the pause between two scenes as interval end minus the end of the last spoken character", () => {
    const { script, characters, scenes } = narrate(["First line here.", "Second line follows.", "Third ends."], [0.5, 2.6, 0.9]);

    const pauses = derivePauses(script, scenes, characters);

    expect(pauses.get("scene-1")).toBeCloseTo(0.5, 6);
    expect(pauses.get("scene-2")).toBeCloseTo(2.6, 6);
  });

  it("runs the last scene's pause to the end of the voice-over", () => {
    const { script, characters, scenes } = narrate(["First line here.", "Last line."], [0.5, 0.9]);

    expect(derivePauses(script, scenes, characters).get("scene-2")).toBeCloseTo(0.9, 6);
  });

  it("is a whole number of milliseconds, so float noise never reaches the read", () => {
    const { script, characters, scenes } = narrate(["Alpha beta gamma.", "Delta epsilon."], [2.6, 0]);

    const pause = derivePauses(script, scenes, characters).get("scene-1")!;

    expect(Math.round(pause * 1000)).toBe(pause * 1000);
  });

  it("has no pause for a scene with no PROMPT or no interval, and still derives the others", () => {
    const { script, characters, scenes } = narrate(["First line here.", "Second line follows.", "Third ends."], [0.5, 1.5, 0.2]);
    scenes[1]!.prompt = "";
    scenes[2]!.narrationInterval = null;

    const pauses = derivePauses(script, scenes, characters);

    expect(pauses.has("scene-2")).toBe(false);
    expect(pauses.has("scene-3")).toBe(false);
    expect(pauses.get("scene-1")).toBeCloseTo(0.5, 6);
  });

  it("yields no pauses, and does not throw, when the timestamps do not match the script", () => {
    const { script, characters, scenes } = narrate(["First line here.", "Second line follows."], [0.5, 0.5]);

    expect(derivePauses(script + " An extra sentence nobody narrated.", scenes, characters).size).toBe(0);
    expect(derivePauses(script, scenes, characters.slice(0, -3)).size).toBe(0);
  });

  it("finds a PROMPT whose whitespace differs from the script (a paragraph break inside a fragment)", () => {
    const narrated = narrate(["First line here.", "Second line follows.", "Third ends."], [0.5, 1.5, 0.2], "\n\n");
    narrated.scenes[1]!.prompt = "Second line follows.";
    narrated.scenes[0]!.prompt = "First   line\nhere.";

    const pauses = derivePauses(narrated.script, narrated.scenes, narrated.characters);

    expect(pauses.get("scene-1")).toBeCloseTo(0.5, 6);
    expect(pauses.get("scene-2")).toBeCloseTo(1.5, 6);
  });

  it("reads the scenes in index order whatever order they are given in", () => {
    const { script, characters, scenes } = narrate(["First line here.", "Second line follows.", "Third ends."], [0.5, 1.5, 0.2]);

    const pauses = derivePauses(script, [...scenes].reverse(), characters);

    expect(pauses.get("scene-1")).toBeCloseTo(0.5, 6);
    expect(pauses.get("scene-2")).toBeCloseTo(1.5, 6);
    expect(pauses.get("scene-3")).toBeCloseTo(0.2, 6);
  });

  it("never reports a negative pause", () => {
    const { script, characters, scenes } = narrate(["First line here.", "Second line follows."], [0, 0]);

    expect(derivePauses(script, scenes, characters).get("scene-1")).toBe(0);
  });
});

describe("pauseRange (design Decision 2)", () => {
  it("exposes the product constants", () => {
    expect(PAUSE_FLOOR_SECONDS).toBe(0.2);
    expect(PAUSE_CAP_SECONDS).toBe(3.0);
    expect(PAUSE_STEP_SECONDS).toBe(0.1);
  });

  it("is 0.2-3.0 s and not speed-limited for a comfortable scene", () => {
    expect(pauseRange({ clipSeconds: 7, speechSeconds: 4.8, originalSeconds: 2.6 })).toEqual({
      originalSeconds: 2.6,
      minSeconds: 0.2,
      maxSeconds: 3.0,
      limitedBySpeedFactor: false,
    });
  });

  it("raises the floor when a shorter pause would speed the clip past the limit", () => {
    // C = 8 s, speech 3.0 s, pause 4.6 s: the interval may not fall below C / 2 = 4 s, so the pause may not fall below 1.0 s.
    expect(pauseRange({ clipSeconds: 8, speechSeconds: 3.0, originalSeconds: 4.6 })).toEqual({
      originalSeconds: 4.6,
      minSeconds: 1.0,
      maxSeconds: 4.6,
      limitedBySpeedFactor: true,
    });
  });

  it("lowers the cap when a longer pause would slow the clip past the limit", () => {
    // C = 5 s, speech 8 s: the interval may not exceed 2 * C = 10 s, so the pause may not exceed 2.0 s.
    expect(pauseRange({ clipSeconds: 5, speechSeconds: 8, originalSeconds: 0.5 })).toEqual({
      originalSeconds: 0.5,
      minSeconds: 0.2,
      maxSeconds: 2.0,
      limitedBySpeedFactor: true,
    });
  });

  it("widens the cap to an original pause above 3.0 s, so reset is always possible", () => {
    const range = pauseRange({ clipSeconds: 15, speechSeconds: 10.4, originalSeconds: 3.4 });

    expect(range.maxSeconds).toBe(3.4);
    expect(range.minSeconds).toBe(0.2);
    expect(range.limitedBySpeedFactor).toBe(false);
  });

  it("does not let an edit make a scene that is already over the limit worse", () => {
    // Interval 11.5 s against a 5 s clip: already 2.3x. A longer pause would be worse, so the cap is the original.
    expect(pauseRange({ clipSeconds: 5, speechSeconds: 11, originalSeconds: 0.5 })).toMatchObject({ minSeconds: 0.2, maxSeconds: 0.5 });
    // Interval 6 s against a 15 s clip: already 2.5x the other way. A shorter pause would be worse, so the floor is the original.
    expect(pauseRange({ clipSeconds: 15, speechSeconds: 4, originalSeconds: 2.0 })).toMatchObject({ minSeconds: 2.0, maxSeconds: 3.0 });
  });
});

describe("isAllowedPause", () => {
  const range = { originalSeconds: 2.63, minSeconds: 0.2, maxSeconds: 3.0, limitedBySpeedFactor: false };

  it("allows 0.1 s grid values inside the range and the original, even off the grid", () => {
    expect(isAllowedPause(range, 1.1)).toBe(true);
    expect(isAllowedPause(range, 0.2)).toBe(true);
    expect(isAllowedPause(range, 3.0)).toBe(true);
    expect(isAllowedPause(range, 2.63)).toBe(true);
  });

  it("refuses off-grid values, and values outside the range", () => {
    expect(isAllowedPause(range, 1.05)).toBe(false);
    expect(isAllowedPause(range, 0.1)).toBe(false);
    expect(isAllowedPause(range, 3.1)).toBe(false);
    expect(isAllowedPause(range, Number.NaN)).toBe(false);
  });

  it("tolerates float noise on the grid", () => {
    expect(isAllowedPause(range, 0.1 + 0.2 + 0.7)).toBe(true); // 1.0000000000000002
  });
});

// group 3 — design Decision 4: effective intervals are a pure function of the stored ones and the edits.
describe("applyPauseEdits (design Decision 4)", () => {
  // Four scenes of 5 s speech each, pauses 1.0 / 2.6 / 1.2 / 0.8 s. Intervals follow D11.
  function session() {
    const pauses = [1.0, 2.6, 1.2, 0.8];
    const intervals: NarrationInterval[] = [];
    let clock = 0;
    for (const pause of pauses) {
      intervals.push({ startSeconds: clock, endSeconds: clock + 5 + pause });
      clock += 5 + pause;
    }
    const scenes = intervals.map((narrationInterval, index) => ({
      id: `scene-${index + 1}`,
      index: index + 1,
      narrationInterval,
      originalPauseSeconds: pauses[index]!,
    }));
    return { scenes, duration: clock };
  }

  it("returns the stored intervals untouched when there are no edits", () => {
    const { scenes, duration } = session();

    const result = applyPauseEdits(scenes, new Map(), duration);

    expect(result.durationSeconds).toBe(duration);
    expect(result.edits).toEqual([]);
    expect([...result.intervals.values()]).toEqual(scenes.map((scene) => scene.narrationInterval));
  });

  it("shortens the scene and shifts every later scene earlier for a trim", () => {
    const { scenes, duration } = session();

    const result = applyPauseEdits(scenes, new Map([["scene-2", 1.1]]), duration);

    expect(result.durationSeconds).toBeCloseTo(duration - 1.5, 9);
    expect(result.intervals.get("scene-1")).toEqual(scenes[0]!.narrationInterval);
    expect(result.intervals.get("scene-2")!.startSeconds).toBe(scenes[1]!.narrationInterval.startSeconds);
    expect(result.intervals.get("scene-2")!.endSeconds).toBeCloseTo(scenes[1]!.narrationInterval.endSeconds - 1.5, 9);
    expect(result.intervals.get("scene-3")!.startSeconds).toBeCloseTo(scenes[2]!.narrationInterval.startSeconds - 1.5, 9);
    expect(result.intervals.get("scene-4")!.endSeconds).toBeCloseTo(duration - 1.5, 9);
  });

  it("lengthens the scene and shifts every later scene later for an extension", () => {
    const { scenes, duration } = session();

    const result = applyPauseEdits(scenes, new Map([["scene-1", 1.5]]), duration);

    expect(result.durationSeconds).toBeCloseTo(duration + 0.5, 9);
    expect(result.intervals.get("scene-1")!.endSeconds).toBeCloseTo(scenes[0]!.narrationInterval.endSeconds + 0.5, 9);
    expect(result.intervals.get("scene-2")!.startSeconds).toBeCloseTo(scenes[1]!.narrationInterval.startSeconds + 0.5, 9);
  });

  it("accumulates several edits", () => {
    const { scenes, duration } = session();

    const result = applyPauseEdits(scenes, new Map([["scene-1", 1.5], ["scene-3", 0.2]]), duration); // +0.5 and -1.0

    expect(result.durationSeconds).toBeCloseTo(duration - 0.5, 9);
    expect(result.intervals.get("scene-4")!.startSeconds).toBeCloseTo(scenes[3]!.narrationInterval.startSeconds - 0.5, 9);
    expect(result.intervals.get("scene-2")!.startSeconds).toBeCloseTo(scenes[1]!.narrationInterval.startSeconds + 0.5, 9);
  });

  it("describes each change at the middle of the original pause, in the original timeline", () => {
    const { scenes, duration } = session();

    const result = applyPauseEdits(scenes, new Map([["scene-2", 1.1], ["scene-4", 1.3]]), duration);

    // Scene 2: interval 6.0..13.6 (pause 2.6 s, speech ends at 11.0) -> middle 12.3. Scene 4: ends at the voice-over's end.
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]!.atSeconds).toBeCloseTo(scenes[1]!.narrationInterval.endSeconds - 1.3, 9);
    expect(result.edits[0]!.deltaSeconds).toBeCloseTo(-1.5, 9);
    expect(result.edits[1]!.atSeconds).toBeCloseTo(duration - 0.4, 9);
    expect(result.edits[1]!.deltaSeconds).toBeCloseTo(0.5, 9);
  });

  it("keeps the intervals a partition of the edited voice-over, with exact comparisons", () => {
    const { scenes, duration } = session();
    const edits = new Map([["scene-1", 0.2], ["scene-2", 3.0], ["scene-3", 0.7], ["scene-4", 2.9]]);

    const result = applyPauseEdits(scenes, edits, duration);

    const ordered = scenes.map((scene) => result.intervals.get(scene.id)!);
    expect(findIntervalPartitionProblem(ordered, result.durationSeconds)).toBeNull();
  });

  it("treats an edit equal to the original pause, or for a scene without a pause, as no edit", () => {
    const { scenes, duration } = session();

    const result = applyPauseEdits(scenes, new Map([["scene-2", 2.6], ["no-such-scene", 1.0]]), duration);

    expect(result.edits).toEqual([]);
    expect(result.durationSeconds).toBe(duration);
  });
});
