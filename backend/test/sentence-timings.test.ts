import { describe, expect, it } from "vitest";
import { findSentences } from "../src/sentences.ts";
import { chunkDurations, sentenceSpeechSpans, unitBoundaries } from "../src/sentenceTimings.ts";
import type { TimestampCharacter } from "../src/narrationTimestamps.ts";

// segment-script-into-chunks (JOS-140), group 3 — design Decisions 2 and 3:
// characters are mapped to sentences by position (ignoring whitespace, which
// forced alignment may drop). decide-silence-allocation (JOS-142, D11,
// product owner decision 2026-09-29): the adopted silence-allocation rule —
// the boundary between two units is the start of the following unit's speech,
// so the previous scene absorbs the silence that follows it — the first
// boundary is 0 and the last the MP3's duration. Replaces JOS-140's interim
// midpoint rule (rejected by the product owner's rendered comparison).

/** One timestamp per character of `text`, `step` seconds each, from `offset`; whitespace characters included. */
function native(text: string, step = 0.1, offset = 0): TimestampCharacter[] {
  return [...text].map((character, index) => ({ text: character, start: offset + index * step, end: offset + (index + 1) * step }));
}

/** Forced-alignment style: no entries for whitespace, and a pause of `gap` seconds where a space was. */
function aligned(text: string, step = 0.1, offset = 0.1, gap = 0.4): TimestampCharacter[] {
  const characters: TimestampCharacter[] = [];
  let clock = offset;
  for (const character of text) {
    if (/\s/.test(character)) {
      clock += gap;
      continue;
    }
    characters.push({ text: character, start: clock, end: clock + step });
    clock += step;
  }
  return characters;
}

const SCRIPT = "Hi there. Bye now.";

describe("Mapping characters to sentences (Decision 2)", () => {
  it("maps native timestamps by position, sentence by sentence", () => {
    const sentences = findSentences(SCRIPT, "en");
    const spans = sentenceSpeechSpans(SCRIPT, sentences, native(SCRIPT));
    // "Hi there." occupies characters 0-8, "Bye now." characters 10-17.
    expect(spans).toHaveLength(2);
    expect(spans[0]!.start).toBeCloseTo(0, 10);
    expect(spans[0]!.end).toBeCloseTo(0.9, 10);
    expect(spans[1]!.start).toBeCloseTo(1.0, 10);
    expect(spans[1]!.end).toBeCloseTo(1.8, 10);
  });

  it("maps alignment timestamps that have no entry for whitespace", () => {
    const sentences = findSentences(SCRIPT, "en");
    const spans = sentenceSpeechSpans(SCRIPT, sentences, aligned(SCRIPT));
    // "Hi there." is 8 non-space characters after a 0.1 s lead-in, plus a 0.4 s pause for the inner space.
    expect(spans[0]!.start).toBeCloseTo(0.1, 10);
    expect(spans[0]!.end).toBeCloseTo(0.1 + 8 * 0.1 + 0.4, 10);
    expect(spans[1]!.start).toBeGreaterThan(spans[0]!.end);
  });

  it("gives the same spans whether or not the timestamps list whitespace", () => {
    const sentences = findSentences(SCRIPT, "en");
    const withSpaces = native(SCRIPT, 0.1, 0);
    const withoutSpaces = withSpaces.filter((c) => !/\s/.test(c.text));
    const a = sentenceSpeechSpans(SCRIPT, sentences, withSpaces);
    const b = sentenceSpeechSpans(SCRIPT, sentences, withoutSpaces);
    expect(b).toEqual(a);
  });

  it("uses the first and last spoken character of a sentence, not the whitespace around it", () => {
    const script = "  Hi there.   Bye now.  ";
    const sentences = findSentences(script, "en");
    const spans = sentenceSpeechSpans(script, sentences, native(script));
    expect(spans[0]!.start).toBeCloseTo(0.2, 10); // "H" is character 2
    expect(spans[0]!.end).toBeCloseTo(1.1, 10); // "." is character 10
  });

  it("maps accents and inverted marks by character, not by byte", () => {
    const script = "¿Qué pasó? ¡Nada!";
    const sentences = findSentences(script, "es");
    const spans = sentenceSpeechSpans(script, sentences, native(script));
    expect(spans).toHaveLength(2);
    expect(spans[0]!.start).toBe(0);
    expect(spans[1]!.end).toBeCloseTo([...script].length * 0.1, 10);
  });

  it("refuses a sentence that has no spoken characters", () => {
    expect(() => sentenceSpeechSpans("Hi there.", [{ text: " ", start: 2, end: 3 }, { text: "Hi there.", start: 0, end: 9 }], native("Hi there."))).toThrow(/no spoken/i);
  });

  it("refuses timestamps whose characters do not match the script", () => {
    const sentences = findSentences(SCRIPT, "en");
    expect(() => sentenceSpeechSpans(SCRIPT, sentences, native("Something else entirely."))).toThrow(/match/i);
  });
});

describe("Unit boundaries and chunk durations (Decision 3; JOS-142, D11)", () => {
  it("places the boundary between two units at the following unit's speech start", () => {
    const boundaries = unitBoundaries([{ start: 0.5, end: 3.0 }, { start: 4.0, end: 8.0 }, { start: 8.5, end: 9.5 }], 10);
    expect(boundaries[1]).toBeCloseTo(4.0, 10);
    expect(boundaries[2]).toBeCloseTo(8.5, 10);
  });

  it("starts at 0 and ends at the MP3's duration", () => {
    const boundaries = unitBoundaries([{ start: 0.5, end: 3.0 }, { start: 4.0, end: 8.0 }], 10);
    expect(boundaries[0]).toBe(0);
    expect(boundaries.at(-1)).toBe(10);
    expect(boundaries).toHaveLength(3);
  });

  it("gives the same boundary as the rejected split-pause rule when two units have no pause between them", () => {
    // With no gap, "the following unit's start" and "the midpoint of the pause" are the same instant.
    const boundaries = unitBoundaries([{ start: 0, end: 5 }, { start: 5, end: 9 }], 9);
    expect(boundaries[1]).toBe(5);
  });

  it("gives per-unit durations that add up to the MP3's duration", () => {
    const spans = [{ start: 0.1, end: 4.2 }, { start: 5.0, end: 9.9 }, { start: 10.8, end: 17.0 }, { start: 17.4, end: 21.6 }];
    const durations = chunkDurations(spans, 22.0);
    expect(durations).toHaveLength(4);
    expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(22.0, 10);
    for (const d of durations) expect(d).toBeGreaterThan(0);
  });

  it("gives the speech spans back when the timestamps are gapless (native)", () => {
    const script = SCRIPT;
    const spans = sentenceSpeechSpans(script, findSentences(script, "en"), native(script));
    const durations = chunkDurations(spans, script.length * 0.1);
    // The one-character space between sentences goes entirely to the first sentence, whose boundary is the second sentence's own start (1.0 s).
    expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(script.length * 0.1, 10);
    expect(durations[0]).toBeCloseTo(1.0, 10);
    expect(durations[1]).toBeCloseTo(0.8, 10);
  });

  it("still partitions the MP3 exactly when the timestamps are forced-alignment shaped (start after 0, end before the audio's end, gaps between units)", () => {
    const script = SCRIPT;
    const mp3Duration = script.length * 0.1 + 0.5; // longer than the last character's end, like a real alignment file
    const spans = sentenceSpeechSpans(script, findSentences(script, "en"), aligned(script));
    const boundaries = unitBoundaries(spans, mp3Duration);
    expect(boundaries[0]).toBe(0);
    expect(boundaries.at(-1)).toBe(mp3Duration);
    expect(boundaries[1]).toBeCloseTo(spans[1]!.start, 10); // the following unit absorbs none of it; the previous one gets all of it
    const durations = chunkDurations(spans, mp3Duration);
    expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(mp3Duration, 10);
  });

  it("handles a single unit: it covers the whole narration", () => {
    expect(chunkDurations([{ start: 0.4, end: 4.0 }], 4.6)).toEqual([4.6]);
  });

  it("returns nothing for no units", () => {
    expect(chunkDurations([], 5)).toEqual([]);
  });

  it("refuses units that overlap so much that a duration is not positive", () => {
    expect(() => chunkDurations([{ start: 0, end: 5 }, { start: 5, end: 6 }], 0.5)).toThrow(RangeError);
  });

  it("refuses a duration that is not positive and finite", () => {
    expect(() => chunkDurations([{ start: 0, end: 1 }], 0)).toThrow(RangeError);
    expect(() => chunkDurations([{ start: 0, end: 1 }], Number.NaN)).toThrow(RangeError);
  });
});
