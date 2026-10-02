import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetAll, createRun } from "../src/db.ts";
import type { TimestampCharacter } from "../src/narrationTimestamps.ts";
import { intervalDurationSeconds, registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { segmentScript } from "../src/segmentation.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// split-sentences-at-clause-boundaries (JOS-141), group 4 — AC1 to AC5: a
// sentence over the maximum is split at clause boundaries, choosing the least
// -cost split; a short sentence borrows the next sentence's first clause and
// nothing else of it; every other sentence stays whole; no boundary keeps a
// sentence whole and flagged; short pieces follow the short-sentence rule.

/**
 * Narrates arbitrary text segments with no pause between them: each segment's
 * characters share its own duration evenly, so segment boundaries fall
 * exactly on the cumulative durations. A segment can be a whole sentence or,
 * when it carries its own trailing comma, one clause of a longer sentence.
 */
function narrate(segmentTexts: readonly string[], segmentDurations: readonly number[], language = "en") {
  const script = segmentTexts.join(" ");
  const characters: TimestampCharacter[] = [];
  let clock = 0;
  segmentTexts.forEach((text, index) => {
    const units = [...text];
    const step = segmentDurations[index]! / units.length;
    units.forEach((character, position) => {
      characters.push({ text: character, start: clock + position * step, end: clock + (position + 1) * step });
    });
    clock += segmentDurations[index]!;
    if (index < segmentTexts.length - 1) characters.push({ text: " ", start: clock, end: clock });
  });
  return { script, characters, mp3Duration: clock, language };
}

function segment(narration: ReturnType<typeof narrate>) {
  return segmentScript(narration.script, narration.language, narration.characters, narration.mp3Duration);
}

function fragmentsOf(narration: ReturnType<typeof narrate>): SegmentedFragment[] {
  const result = segment(narration);
  if (!result.ok) throw new Error(`Expected fragments, got: ${result.reason}`);
  return result.fragments;
}

const texts = (fragments: readonly SegmentedFragment[]) => fragments.map((f) => f.text);
const durations = (fragments: readonly SegmentedFragment[]) => fragments.map((f) => intervalDurationSeconds(f.narrationInterval));
const exceptions = (fragments: readonly SegmentedFragment[]) => fragments.map((f) => f.exception);

describe("A sentence over the maximum is split (AC1)", () => {
  it("becomes pieces whose chunks each last at most 15 s", () => {
    // One comma boundary; 8 + 14 = 22 s, free (over 15 s alone); the 22 s span itself is not a valid chunk.
    const narration = narrate(["Alpha bravo charlie delta,", "echo foxtrot golf hotel india juliet kilo lima."], [8, 14]);
    const fragments = fragmentsOf(narration);
    expect(texts(fragments)).toEqual(["Alpha bravo charlie delta,", "echo foxtrot golf hotel india juliet kilo lima."]);
    expect(durations(fragments)).toEqual([expect.closeTo(8, 9), expect.closeTo(14, 9)]);
    expect(exceptions(fragments)).toEqual([undefined, undefined]);
  });

  it("chooses the split needing the least total speed change among several", () => {
    // Same four durations, and the same two valid groupings, as JOS-140's own DP test — now as one free
    // sentence's clause pieces (three commas) instead of four separate sentences.
    const narration = narrate(
      ["Alpha one,", "bravo two,", "charlie three,", "delta four five six."],
      [5.5, 5.5, 6.2, 6.3],
    );
    const fragments = fragmentsOf(narration);
    expect(texts(fragments)).toEqual(["Alpha one, bravo two,", "charlie three, delta four five six."]);
    expect(durations(fragments)).toEqual([expect.closeTo(11, 9), expect.closeTo(12.5, 9)]);
    expect(exceptions(fragments)).toEqual([undefined, undefined]);
  });
});

describe("A short sentence borrows the next sentence's first clause (AC2)", () => {
  it("groups the short sentence with the first piece only; the rest of the sentence is untouched", () => {
    // "Wait now." (3 s, short) + "Alpha one, bravo two, charlie three four five." (13 s alone, not
    // free; 3 + 13 = 16 s > 15, borrowed). Only the first comma is exposed, so "bravo two, charlie
    // three four five." stays one unit even though it has its own internal comma.
    const narration = narrate(["Wait now.", "Alpha one,", "bravo two,", "charlie three four five."], [3, 6, 3, 4]);
    const fragments = fragmentsOf(narration);
    expect(texts(fragments)).toEqual(["Wait now. Alpha one,", "bravo two, charlie three four five."]);
    expect(durations(fragments)).toEqual([expect.closeTo(9, 9), expect.closeTo(7, 9)]);
    expect(exceptions(fragments)).toEqual([undefined, undefined]);
  });
});

describe("No other sentence is split (AC3)", () => {
  it("keeps a 9 s sentence with commas whole in an ordinary script", () => {
    const narration = narrate(["Ready now.", "Alpha one, bravo two, charlie three.", "Done today."], [6, 9, 6]);
    const fragments = fragmentsOf(narration);
    expect(texts(fragments)).toEqual(["Ready now. Alpha one, bravo two, charlie three.", "Done today."]);
    expect(fragments.some((f) => f.text === "Alpha one, bravo two, charlie three.")).toBe(false); // it is not its own fragment...
    expect(fragments.some((f) => f.text.includes("Alpha one, bravo two, charlie three."))).toBe(true); // ...but it is whole, inside one
  });
});

describe("A sentence without clause boundaries is kept whole (AC4)", () => {
  it("flags an 18 s sentence with no comma, semicolon or listed conjunction", () => {
    const narration = narrate(["The tide slowly rose above the old stone harbor wall tonight."], [18]);
    const fragments = fragmentsOf(narration);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.exception).toBe("unsplittable-sentence");
    expect(intervalDurationSeconds(fragments[0]!.narrationInterval)).toBeCloseTo(18, 9);
  });

  it("flags a 3 s sentence before a 14 s sentence with no boundary", () => {
    const narration = narrate(["Wait now.", "The tide slowly rose above the old stone harbor wall."], [3, 14]);
    const fragments = fragmentsOf(narration);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.exception).toBe("unsplittable-sentence");
    expect(intervalDurationSeconds(fragments[0]!.narrationInterval)).toBeCloseTo(17, 9);
  });

  it("does not flag any piece of a sentence that was actually split", () => {
    const narration = narrate(["Alpha bravo charlie delta,", "echo foxtrot golf hotel india juliet kilo lima."], [8, 14]);
    const fragments = fragmentsOf(narration);
    expect(exceptions(fragments)).toEqual([undefined, undefined]);
  });
});

describe("A short clause piece follows the short-sentence rule (Decision 3, the ticket's assumption)", () => {
  it("joins the unit that follows it, mid-script", () => {
    // Free sentence "Alpha... golf," (16 s) + "tiny." (3 s, short) = 19 s, one comma boundary; the 16 s
    // piece cannot combine with the short one (not the short-goes-first exception), so it stands alone,
    // flagged, and the 3 s piece must join the next sentence instead.
    const narration = narrate(
      ["Alpha bravo charlie delta echo foxtrot golf,", "tiny.", "Done here today."],
      [16, 3, 6],
    );
    const fragments = fragmentsOf(narration);
    expect(texts(fragments)).toEqual(["Alpha bravo charlie delta echo foxtrot golf,", "tiny. Done here today."]);
    expect(exceptions(fragments)).toEqual(["unsplittable-sentence", undefined]);
    expect(durations(fragments)).toEqual([expect.closeTo(16, 9), expect.closeTo(9, 9)]);
  });

  it("joins the unit before it when it ends the script", () => {
    // One free sentence, its own last piece short (3 s) and the script's last unit.
    const narration = narrate(["Alpha bravo charlie,", "delta echo foxtrot,", "tiny."], [7, 7, 3]);
    const fragments = fragmentsOf(narration);
    expect(texts(fragments)).toEqual(["Alpha bravo charlie,", "delta echo foxtrot, tiny."]);
    expect(exceptions(fragments)).toEqual([undefined, undefined]);
    expect(durations(fragments)).toEqual([expect.closeTo(7, 9), expect.closeTo(10, 9)]);
  });
});

describe("Split pieces reproduce the sentence (AC5)", () => {
  const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

  it("joins back to the original script apart from whitespace", () => {
    const narration = narrate(
      ["Alpha one,", "bravo two,", "charlie three,", "delta four five six."],
      [5.5, 5.5, 6.2, 6.3],
    );
    const fragments = fragmentsOf(narration);
    expect(normalise(fragments.map((f) => f.text).join(" "))).toBe(normalise(narration.script));
  });

  it("is accepted by JOS-144's registration for a split script", async () => {
    resetAll();
    const narration = narrate(["Alpha bravo charlie delta,", "echo foxtrot golf hotel india juliet kilo lima."], [8, 14]);
    const runId = randomUUID();
    createRun(runId, "Clause split test", narration.script, "en");
    const generator: VisualInstructionGenerator = {
      async generate(texts) {
        return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
      },
    };
    const result = await registerDecomposition(runId, fragmentsOf(narration), generator, narration.mp3Duration);
    expect(result.ok).toBe(true);
  });
});
