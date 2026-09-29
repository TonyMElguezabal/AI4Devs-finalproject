import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { VIDEO_ADMITTED_DURATION_SECONDS } from "../src/config/providers.ts";
import { closestAdmittedDuration } from "../src/admittedDurations.ts";
import { createRun, resetAll } from "../src/db.ts";
import type { TimestampCharacter } from "../src/narrationTimestamps.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { findSentences } from "../src/sentences.ts";
import { segmentScript } from "../src/segmentation.ts";
import { sentenceSpeechSpans, unitBoundaries } from "../src/sentenceTimings.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// segment-script-into-chunks (JOS-140), group 4 — design Decisions 4 and 5:
// fragments of whole consecutive sentences within 5-15 s, short sentences
// grouped with a neighbour (a fragment may end on a short sentence only when
// no grouping avoids it), the two flagged exceptions, the grouping needing
// the least total speed change (an exhaustive search checked here against an
// independent brute-force oracle), and "no valid grouping" as an error.

const { min: LOWER, max: UPPER } = VIDEO_ADMITTED_DURATION_SECONDS;

interface Narration {
  script: string;
  characters: TimestampCharacter[];
  mp3Duration: number;
  sentenceTexts: string[];
}

/**
 * A script of `sentenceTexts` narrated with no pause between sentences: each
 * sentence's characters share its duration evenly, so the sentence boundaries
 * fall exactly on the cumulative durations.
 */
function narrate(sentenceTexts: readonly string[], durations: readonly number[], language = "en"): Narration & { language: string } {
  const script = sentenceTexts.join(" ");
  const characters: TimestampCharacter[] = [];
  let clock = 0;
  sentenceTexts.forEach((text, index) => {
    const units = [...text];
    const step = durations[index]! / units.length;
    units.forEach((character, position) => {
      characters.push({ text: character, start: clock + position * step, end: clock + (position + 1) * step });
    });
    clock += durations[index]!;
    if (index < sentenceTexts.length - 1) characters.push({ text: " ", start: clock, end: clock });
  });
  return { script, characters, mp3Duration: clock, sentenceTexts: [...sentenceTexts], language };
}

/** Sentences "Scene 1 is here." … with the given narrated durations. */
function scenes(durations: readonly number[]) {
  return narrate(durations.map((_, index) => `Scene ${index + 1} is here.`), durations);
}

function segment(narration: ReturnType<typeof narrate>) {
  return segmentScript(narration.script, narration.language, narration.characters, narration.mp3Duration);
}

function fragmentsOf(narration: ReturnType<typeof narrate>): SegmentedFragment[] {
  const result = segment(narration);
  if (!result.ok) throw new Error(`Expected fragments, got: ${result.reason}`);
  return result.fragments;
}

/** Which sentences (by 1-based number) each fragment holds, from its text. */
function sentenceNumbersPerFragment(fragments: readonly SegmentedFragment[]): number[][] {
  return fragments.map((fragment) => [...fragment.text.matchAll(/Scene (\d+) is here\./g)].map((match) => Number(match[1])));
}

describe("Ordinary scripts (AC03)", () => {
  it("gives fragments of whole consecutive sentences, each within 5-15 s", () => {
    const narration = scenes([6, 7, 8, 9, 10, 7, 6]);
    const fragments = fragmentsOf(narration);

    const numbers = sentenceNumbersPerFragment(fragments);
    expect(numbers.flat()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const fragment of fragments) {
      expect(fragment.narratedDurationSeconds).toBeGreaterThanOrEqual(LOWER);
      expect(fragment.narratedDurationSeconds).toBeLessThanOrEqual(UPPER);
      expect(fragment.exception).toBeUndefined();
    }
  });

  it("never cuts inside a sentence: each fragment's text is a run of whole sentences", () => {
    const narration = scenes([6, 7, 8, 9]);
    for (const fragment of fragmentsOf(narration)) {
      expect(fragment.text).toMatch(/^Scene \d+ is here\.( Scene \d+ is here\.)*$/);
    }
  });

  it("gives narrated durations that add up to the MP3's duration", () => {
    const narration = scenes([6.3, 7.1, 8.4, 9.2, 5.9]);
    const total = fragmentsOf(narration).reduce((sum, fragment) => sum + fragment.narratedDurationSeconds, 0);
    expect(total).toBeCloseTo(narration.mp3Duration, 9);
  });
});

describe("Short sentences (AC03)", () => {
  it("groups a short sentence with the one that follows", () => {
    expect(sentenceNumbersPerFragment(fragmentsOf(scenes([6, 3, 7])))).toEqual([[1], [2, 3]]);
  });

  it("groups a short last sentence with the previous one", () => {
    expect(sentenceNumbersPerFragment(fragmentsOf(scenes([8, 3])))).toEqual([[1, 2]]);
  });

  it("groups several short sentences together until they are long enough", () => {
    expect(sentenceNumbersPerFragment(fragmentsOf(scenes([2, 2, 2, 8])))).toEqual([[1, 2, 3, 4]]);
  });

  it("allows a fragment to end on a short sentence when every grouping must, instead of refusing the script", () => {
    // 4 + 4 + 4: no grouping avoids ending on a short sentence except the whole script, which is 12 s.
    expect(sentenceNumbersPerFragment(fragmentsOf(scenes([4, 4, 4])))).toEqual([[1, 2, 3]]);
    // 4 + 4 | 4 + 4: 8 s and 8 s; the first fragment ends on a short sentence and there is no way around it.
    expect(sentenceNumbersPerFragment(fragmentsOf(scenes([4, 4, 4, 4, 4, 4])))).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("does not refuse a script only because most of its sentences are short (measured English narration)", () => {
    // Sentence shares of a real 13-sentence English narration (JOS-140 manual test, 2026-09-28).
    const fragments = fragmentsOf(scenes([2.9, 5.0, 7.2, 4.0, 4.9, 3.1, 3.4, 2.9, 4.7, 3.2, 4.6, 5.2, 4.1]));
    expect(sentenceNumbersPerFragment(fragments)).toEqual([[1, 2], [3], [4, 5, 6], [7, 8, 9, 10], [11, 12, 13]]);
    for (const fragment of fragments) {
      expect(fragment.narratedDurationSeconds).toBeGreaterThanOrEqual(LOWER);
      expect(fragment.narratedDurationSeconds).toBeLessThanOrEqual(UPPER);
    }
  });

  it("does not refuse a script only because most of its sentences are short (measured Spanish narration)", () => {
    const fragments = fragmentsOf(scenes([3.9, 3.7, 3.7, 4.4, 4.3, 3.6, 4.1, 5.3, 4.0, 5.7, 3.8, 5.7]));
    expect(sentenceNumbersPerFragment(fragments)).toEqual([[1, 2, 3], [4, 5], [6, 7, 8], [9, 10], [11, 12]]);
  });

  it("prefers fewer fragments ending on a short sentence even when another grouping needs less speed change", () => {
    // The English narration above: "S1-S2 | S3-S4 | S5-S6 | S7-S10 | S11-S13" needs less speed change (0.052 against 0.062)
    // but has three fragments ending on a short sentence instead of two.
    const fragments = fragmentsOf(scenes([2.9, 5.0, 7.2, 4.0, 4.9, 3.1, 3.4, 2.9, 4.7, 3.2, 4.6, 5.2, 4.1]));
    expect(sentenceNumbersPerFragment(fragments)).not.toEqual([[1, 2], [3, 4], [5, 6], [7, 8, 9, 10], [11, 12, 13]]);
  });

  it("keeps a one-sentence script alone", () => {
    const fragments = fragmentsOf(scenes([7]));
    expect(sentenceNumbersPerFragment(fragments)).toEqual([[1]]);
    expect(fragments[0]!.exception).toBeUndefined();
  });
});

describe("A whole script below the lower bound", () => {
  it("becomes one fragment flagged script-below-lower-bound", () => {
    const fragments = fragmentsOf(scenes([1.5, 2]));
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.exception).toBe("script-below-lower-bound");
    expect(fragments[0]!.narratedDurationSeconds).toBeCloseTo(3.5, 9);
    expect(sentenceNumbersPerFragment(fragments)).toEqual([[1, 2]]);
  });

  it("flags a one-sentence script below the bound too", () => {
    const fragments = fragmentsOf(scenes([3]));
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.exception).toBe("script-below-lower-bound");
  });
});

describe("Fragments that cannot fit without a split (interim, until JOS-141)", () => {
  it("keeps a sentence over the maximum alone, flagged unsplittable-sentence", () => {
    const fragments = fragmentsOf(scenes([20]));
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.exception).toBe("unsplittable-sentence");
    expect(fragments[0]!.narratedDurationSeconds).toBeCloseTo(20, 9);
  });

  it("flags only the fragment that needs it", () => {
    const fragments = fragmentsOf(scenes([7, 20, 6]));
    expect(sentenceNumbersPerFragment(fragments)).toEqual([[1], [2], [3]]);
    expect(fragments.map((fragment) => fragment.exception)).toEqual([undefined, "unsplittable-sentence", undefined]);
  });

  it("keeps a short sentence and a next one over the maximum together, flagged", () => {
    const fragments = fragmentsOf(scenes([3, 14]));
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.exception).toBe("unsplittable-sentence");
    expect(fragments[0]!.narratedDurationSeconds).toBeCloseTo(17, 9);
    expect(sentenceNumbersPerFragment(fragments)).toEqual([[1, 2]]);
  });

  it("accepts every fragment it flags through JOS-144's validation", async () => {
    resetAll();
    const narration = scenes([7, 3, 14, 20, 6]);
    const runId = randomUUID();
    createRun(runId, "Segmentation test", narration.script, "en");
    const generator: VisualInstructionGenerator = {
      async generate(texts) {
        return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
      },
    };
    const result = await registerDecomposition(runId, fragmentsOf(narration), generator);
    expect(result.ok).toBe(true);
  });
});

describe("The grouping needing the least speed change is chosen (AC04)", () => {
  it("picks the smaller total speed change between two valid groupings", () => {
    // Both "5.5 + 5.5 | 6.2 + 6.3" and "5.5 | 5.5 + 6.2 | 6.3" are valid; the first totals 0.039, the second 0.161.
    const fragments = fragmentsOf(scenes([5.5, 5.5, 6.2, 6.3]));
    expect(sentenceNumbersPerFragment(fragments)).toEqual([[1, 2], [3, 4]]);
    expect(fragments.map((fragment) => fragment.narratedDurationSeconds)).toEqual([expect.closeTo(11, 9), expect.closeTo(12.5, 9)]);
  });

  it("prefers fewer fragments when the speed change is the same", () => {
    // Every grouping of 5 s sentences needs no change at all, so the single 15 s fragment wins.
    // Note: dropping this rule changes no result here — merging sentences never costs more speed
    // change than splitting them, so the "later first cut" rule reaches the same grouping (a
    // search of 60,000 random integer scripts found no case where they differ). It stays because
    // the spec states it as the second tie-break.
    expect(sentenceNumbersPerFragment(fragmentsOf(scenes([5, 5, 5])))).toEqual([[1, 2, 3]]);
  });

  it("prefers the grouping whose first cut comes later when count and speed change are the same", () => {
    // 5+15, 10+10 and 15+5 all need no change; the first cut after sentence 3 is the latest.
    expect(sentenceNumbersPerFragment(fragmentsOf(scenes([5, 5, 5, 5])))).toEqual([[1, 2, 3], [4]]);
  });

  it("is deterministic", () => {
    const narration = scenes([5.5, 5.5, 6.2, 6.3, 7.7, 4.1, 9.9]);
    expect(segment(narration)).toEqual(segment(narration));
  });

  describe("against an exhaustive reference search", () => {
    type Group = readonly [first: number, last: number];

    /** The rules of design Decision 4 (as amended) and the best grouping, by trying every set of cuts. */
    function bestGroupingByBruteForce(boundaries: readonly number[]): Group[] | null {
      const count = boundaries.length - 1;
      const duration = (first: number, last: number) => boundaries[last + 1]! - boundaries[first]!;
      const isShort = (index: number) => duration(index, index) < LOWER;

      const isAllowed = (first: number, last: number): boolean => {
        const length = duration(first, last);
        if (length >= LOWER && length <= UPPER) return true;
        if (length < LOWER) return first === 0 && last === count - 1;
        return first === last || (last === first + 1 && isShort(first));
      };
      const cost = (first: number, last: number) => Math.log(closestAdmittedDuration(duration(first, last)).speedRatio);

      const endsOnShortSentence = (first: number, last: number) => isShort(last) && last !== count - 1 && first <= last;
      const shortEnds = (groups: Group[]) => groups.filter(([f, l]) => endsOnShortSentence(f, l)).length;

      let best: { groups: Group[]; total: number } | null = null;
      for (let cutMask = 0; cutMask < 1 << (count - 1); cutMask++) {
        const groups: Group[] = [];
        let first = 0;
        for (let index = 0; index < count; index++) {
          const cutsAfter = index === count - 1 || (cutMask >> index) & 1;
          if (cutsAfter) {
            groups.push([first, index]);
            first = index + 1;
          }
        }
        if (!groups.every(([f, l]) => isAllowed(f, l))) continue;
        const total = groups.reduce((sum, [f, l]) => sum + cost(f, l), 0);
        if (best === null || isBetter(groups, total, best.groups, best.total, shortEnds)) best = { groups, total };
      }
      return best?.groups ?? null;
    }

    function isBetter(a: Group[], costA: number, b: Group[], costB: number, shortEnds: (groups: Group[]) => number): boolean {
      if (shortEnds(a) !== shortEnds(b)) return shortEnds(a) < shortEnds(b);
      if (Math.abs(costA - costB) > 1e-9) return costA < costB;
      if (a.length !== b.length) return a.length < b.length;
      for (let index = 0; index < a.length; index++) {
        if (a[index]![1] !== b[index]![1]) return a[index]![1] > b[index]![1]; // the later cut wins
      }
      return false;
    }

    function seededRandom(seed: number): () => number {
      let state = seed;
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    }

    it("agrees with trying every grouping, on 400 random scripts of 1-9 sentences", () => {
      const random = seededRandom(20260928);
      const outcomes = { grouped: 0, refused: 0, flagged: 0, multipleFragments: 0 };

      for (let trial = 0; trial < 400; trial++) {
        const sentenceCount = 1 + Math.floor(random() * 9);
        const durations = Array.from({ length: sentenceCount }, () => Math.round((1 + random() * 17) * 1000) / 1000);
        const narration = scenes(durations);

        // Both sides read the boundaries the pipeline computes, so they see identical numbers.
        const sentences = findSentences(narration.script, "en");
        const spans = sentenceSpeechSpans(narration.script, sentences, narration.characters);
        const boundaries = unitBoundaries(spans, narration.mp3Duration);
        const expected = bestGroupingByBruteForce(boundaries);
        const result = segment(narration);

        if (expected === null) {
          expect(result.ok, `trial ${trial}: ${durations.join(", ")}`).toBe(false);
          outcomes.refused++;
          continue;
        }
        expect(result.ok, `trial ${trial}: ${durations.join(", ")}`).toBe(true);
        if (!result.ok) continue;
        const actual = sentenceNumbersPerFragment(result.fragments).map((numbers) => [numbers[0]! - 1, numbers.at(-1)! - 1]);
        expect(actual, `trial ${trial}: ${durations.join(", ")}`).toEqual(expected);
        outcomes.grouped++;
        if (result.fragments.some((fragment) => fragment.exception)) outcomes.flagged++;
        if (result.fragments.length > 1) outcomes.multipleFragments++;
      }

      // The random scripts must actually exercise the interesting branches.
      expect(outcomes.grouped).toBeGreaterThan(100);
      expect(outcomes.refused).toBeGreaterThan(0);
      expect(outcomes.flagged).toBeGreaterThan(0);
      expect(outcomes.multipleFragments).toBeGreaterThan(50);
    });
  });
});

describe("A script with no valid grouping (Decision 5)", () => {
  it("returns an error and no fragments", () => {
    // 14 s cannot take the 2 s sentence after it (16 s), and 2 s cannot stand alone.
    const result = segment(scenes([14, 2]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/grouping/i);
    expect(result).not.toHaveProperty("fragments");
  });

  it("returns an error for a script with no sentences", () => {
    const result = segmentScript("   ", "en", [], 5);
    expect(result.ok).toBe(false);
  });

  it("returns an error, not an exception, when the timestamps do not match the script", () => {
    const narration = scenes([6, 7]);
    const result = segmentScript("A completely different script.", "en", narration.characters, narration.mp3Duration);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/match/i);
  });
});

describe("The fragments reproduce the script (AC03)", () => {
  const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

  it("reproduces an English script apart from whitespace", () => {
    const narration = narrate(
      ["Mr. Smith opened the old shop at dawn.", "He swept the floor, then lit the lamps.", "Customers came slowly!", "By noon, the street was full."],
      [7, 6, 4, 8],
    );
    const fragments = fragmentsOf(narration);
    expect(normalise(fragments.map((f) => f.text).join(" "))).toBe(normalise(narration.script));
  });

  it("reproduces a Spanish script with ¿, ¡ and accents", () => {
    const narration = narrate(
      ["¿Cómo estás hoy, señora López?", "¡Muy bien, gracias por preguntar!", "La niña compró piñas y añadió azúcar.", "Después, todos volvieron a casa."],
      [6, 6, 7, 6],
      "es",
    );
    const fragments = fragmentsOf(narration);
    expect(normalise(fragments.map((f) => f.text).join(" "))).toBe(normalise(narration.script));
    for (const fragment of fragments) expect(fragment.text).toBe(fragment.text.trim());
  });

  it("keeps the script's own inner whitespace inside a fragment", () => {
    const narration = narrate(["First sentence here.", "Second one follows."], [6, 6]);
    const spaced = { ...narration, script: "First sentence here.\n\nSecond one follows." };
    const result = segmentScript(spaced.script, "en", narration.characters, narration.mp3Duration);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fragments.map((f) => f.text)).toEqual(["First sentence here.\n\nSecond one follows."]);
  });

  describe("accepted by JOS-144's registration for the same script and durations", () => {
    beforeEach(() => {
      resetAll();
    });

    it.each([
      ["English", "en", ["Mr. Smith opened the shop.", "He swept the floor.", "Customers came slowly.", "The street filled up."], [6, 7, 6, 8]],
      ["Spanish", "es", ["¿Cómo estás hoy?", "¡Muy bien, gracias!", "La niña compró piñas.", "Todos volvieron a casa."], [4, 4, 7, 6]],
    ] as const)("%s", async (_name, language, sentenceTexts, durations) => {
      const narration = narrate(sentenceTexts, durations, language);
      const runId = randomUUID();
      createRun(runId, "Segmentation test", narration.script, language);
      const generator: VisualInstructionGenerator = {
        async generate(texts) {
          return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
        },
      };
      const result = await registerDecomposition(runId, fragmentsOf(narration), generator);
      expect(result.ok).toBe(true);
    });
  });
});
