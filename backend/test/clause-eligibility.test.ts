import { describe, expect, it } from "vitest";
import { buildUnits, classifyMustSplit } from "../src/clauseSplitting.ts";
import { findSentences } from "../src/sentences.ts";
import { sentenceSpeechSpans, unitBoundaries, chunkDurations } from "../src/sentenceTimings.ts";
import type { TimestampCharacter } from "../src/narrationTimestamps.ts";

// split-sentences-at-clause-boundaries (JOS-141), group 3 — design Decisions 2
// and 3: which sentences must split (free: over 15 s alone; borrowed: after a
// short sentence whose sum exceeds 15 s), and the flat unit list the grouping
// search runs over (whole sentences, and clause pieces of must-split ones).

describe("Classifying which sentences must split (Decision 2)", () => {
  it("marks a sentence over the maximum as free, whatever comes before it", () => {
    expect(classifyMustSplit([6, 16])).toEqual([{ free: false, borrowed: false }, { free: true, borrowed: false }]);
  });

  it("marks the sentence after a short one, whose sum exceeds the maximum, as borrowed", () => {
    expect(classifyMustSplit([3, 14])).toEqual([{ free: false, borrowed: false }, { free: false, borrowed: true }]);
  });

  it("does not mark a sentence borrowed when the short one before it fits within the maximum together", () => {
    expect(classifyMustSplit([3, 10])).toEqual([{ free: false, borrowed: false }, { free: false, borrowed: false }]);
  });

  it("does not mark a sentence borrowed when the one before it is not short", () => {
    expect(classifyMustSplit([6, 14])).toEqual([{ free: false, borrowed: false }, { free: false, borrowed: false }]);
  });

  it("marks a sentence both free and borrowed when both conditions hold", () => {
    expect(classifyMustSplit([3, 16])).toEqual([{ free: false, borrowed: false }, { free: true, borrowed: true }]);
  });

  it("never marks the first sentence borrowed, since it has no previous sentence", () => {
    expect(classifyMustSplit([16])).toEqual([{ free: true, borrowed: false }]);
  });

  it("does not mark a sentence of exactly the maximum as free", () => {
    expect(classifyMustSplit([15])).toEqual([{ free: false, borrowed: false }]);
  });

  it("marks everything else whole (neither free nor borrowed)", () => {
    expect(classifyMustSplit([6, 7, 8, 9])).toEqual([
      { free: false, borrowed: false },
      { free: false, borrowed: false },
      { free: false, borrowed: false },
      { free: false, borrowed: false },
    ]);
  });
});

describe("Building the unit list (Decisions 2 and 3)", () => {
  it("keeps a whole (neither free nor borrowed) sentence as one unit, even with clause boundaries inside", () => {
    const script = "The tide rose, but the wind fell. It stayed calm.";
    const sentences = findSentences(script, "en");
    const units = buildUnits(script, sentences, "en", [9, 6]);
    expect(units.map((u) => u.text)).toEqual(["The tide rose, but the wind fell.", "It stayed calm."]);
  });

  it("splits a free must-split sentence at every clause boundary", () => {
    const script = "The tide rose, but the wind fell, and the sky cleared into evening.";
    const sentences = findSentences(script, "en");
    const units = buildUnits(script, sentences, "en", [22]);
    expect(units.map((u) => u.text)).toEqual(["The tide rose,", "but the wind fell,", "and the sky cleared into evening."]);
  });

  it("splits a borrowed sentence only at its first clause boundary, keeping the rest as one unit", () => {
    const script = "It was late. The tide rose, but the wind fell, and the sky cleared.";
    const sentences = findSentences(script, "en");
    const units = buildUnits(script, sentences, "en", [3, 14]);
    expect(units.map((u) => u.text)).toEqual(["It was late.", "The tide rose,", "but the wind fell, and the sky cleared."]);
  });

  it("keeps a must-split sentence whole when it has no clause boundary", () => {
    const script = "It was late. The tide slowly rose above the old stone harbor wall.";
    const sentences = findSentences(script, "en");
    // Free (over the maximum) and no comma, semicolon or listed conjunction: no split possible.
    const freeUnits = buildUnits(script, sentences, "en", [3, 16]);
    expect(freeUnits.map((u) => u.text)).toEqual(["It was late.", "The tide slowly rose above the old stone harbor wall."]);
  });

  it("keeps a borrowed-only sentence whole when it has no clause boundary", () => {
    const script = "It was late. The tide slowly rose above the old stone harbor wall today.";
    const sentences = findSentences(script, "en");
    // Borrowed (3 + 13 > 15) but not free (13 <= 15), and no comma, semicolon or listed conjunction.
    const units = buildUnits(script, sentences, "en", [3, 13]);
    expect(units.map((u) => u.text)).toEqual(["It was late.", "The tide slowly rose above the old stone harbor wall today."]);
  });

  it("reproduces the sentences exactly when joined, whether split or not", () => {
    const script = "The tide rose, but the wind fell, and the sky cleared into evening. It stayed calm.";
    const sentences = findSentences(script, "en");
    const units = buildUnits(script, sentences, "en", [22, 6]);
    expect(units.map((u) => u.text).join(" ")).toBe(script);
  });

  it("splits a Spanish sentence at its boundaries, keeping accents intact", () => {
    const script = "El barco volvió, pero la niña se quedó, y el mar se calmó al anochecer despacio.";
    const sentences = findSentences(script, "es");
    const units = buildUnits(script, sentences, "es", [22]);
    expect(units.map((u) => u.text)).toEqual(["El barco volvió,", "pero la niña se quedó,", "y el mar se calmó al anochecer despacio."]);
  });
});

describe("Clause pieces get real timings (Decision 3)", () => {
  /** One timestamp per character of `text`, `step` seconds each, from `offset`. */
  function native(text: string, step: number, offset = 0): TimestampCharacter[] {
    return [...text].map((character, index) => ({ text: character, start: offset + index * step, end: offset + (index + 1) * step }));
  }

  it("gives each piece its own speech span, and places the piece boundary at the following piece's speech start", () => {
    const script = "The tide rose, but the wind stayed calm.";
    const sentences = findSentences(script, "en");
    const units = buildUnits(script, sentences, "en", [23]);
    expect(units.map((u) => u.text)).toEqual(["The tide rose,", "but the wind stayed calm."]);

    const characters = native(script, 0.5);
    const spans = sentenceSpeechSpans(script, units, characters);
    expect(spans).toHaveLength(2);
    expect(spans[0]!.start).toBe(0);
    expect(spans[1]!.start).toBeGreaterThan(spans[0]!.end);
    expect(spans[1]!.end).toBeCloseTo(script.length * 0.5, 9);

    const boundaries = unitBoundaries(spans, script.length * 0.5);
    expect(boundaries[1]).toBeCloseTo(spans[1]!.start, 10);

    const durations = chunkDurations(spans, script.length * 0.5);
    expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(script.length * 0.5, 9);
  });
});
