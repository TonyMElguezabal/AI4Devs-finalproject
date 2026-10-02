import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { requestedClipDuration } from "../src/admittedDurations.ts";
import { createRun, createScene, getRun, getScenesForRun, resetAll } from "../src/db.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";
import { contiguousFragments, voiceOverDurationOf, type FragmentSpec } from "./fragmentFixtures.ts";

// assign-scene-identifiers (JOS-144), group 4 — PRD §5 step 5, §6, §6.1,
// §4.2: numbering 1..N, the four content fields, and the refusal of an
// invalid system-generated decomposition as a DECOMPOSITION failure, never a
// script error, leaving no chunks (design Decisions 1, 5 and 6).

const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide. Gulls circle overhead.";
const SPECS: FragmentSpec[] = [
  { text: "The harbor is quiet at dusk.", seconds: 6 },
  { text: "Fishing boats return with the tide.", seconds: 9.5 },
  { text: "Gulls circle overhead.", seconds: 5 },
];
const FRAGMENTS: SegmentedFragment[] = contiguousFragments(SPECS);
const DURATION = voiceOverDurationOf(FRAGMENTS);

/** The base specs with the spec at `index` overridden. */
function specsWith(index: number, override: Partial<FragmentSpec>): FragmentSpec[] {
  return SPECS.map((spec, position) => (position === index ? { ...spec, ...override } : spec));
}

beforeEach(() => {
  resetAll();
});

function newRunId(script = SCRIPT): string {
  const runId = randomUUID();
  createRun(runId, "Registration test", script, "en");
  return runId;
}

/** A stub generator: records every call and answers with `answer(texts)`. */
function stubGenerator(answer?: (texts: readonly string[]) => VisualInstructionResult) {
  const calls: Array<{ texts: readonly string[]; language: string }> = [];
  const generator: VisualInstructionGenerator = {
    async generate(texts, language) {
      calls.push({ texts, language });
      return answer
        ? answer(texts)
        : { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
  return { generator, calls };
}

describe("A valid decomposition registers chunks 1..N (AC1, AC2, AC5)", () => {
  it("numbers the chunks 1 to N in fragment order with their prompt, image and video, all submitted", async () => {
    const runId = newRunId();
    const { generator } = stubGenerator();

    const result = await registerDecomposition(runId, FRAGMENTS, generator, DURATION);

    expect(result.ok).toBe(true);
    const scenes = getScenesForRun(runId);
    expect(scenes.map((s) => ({ index: s.index, prompt: s.prompt, image: s.imageInstruction, video: s.videoInstruction, status: s.status }))).toEqual([
      { index: 1, prompt: "The harbor is quiet at dusk.", image: "image 1", video: "video 1", status: "submitted" },
      { index: 2, prompt: "Fishing boats return with the tide.", image: "image 2", video: "video 2", status: "submitted" },
      { index: 3, prompt: "Gulls circle overhead.", image: "image 3", video: "video 3", status: "submitted" },
    ]);
  });

  it("sets the skeleton's instruction to the IMAGE instruction (Decision 3)", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION);
    expect(getScenesForRun(runId).map((s) => s.instruction)).toEqual(["image 1", "image 2", "image 3"]);
  });

  it("asks the generator once, with every fragment text in order and the session's language", async () => {
    const runId = newRunId();
    const { generator, calls } = stubGenerator();
    await registerDecomposition(runId, FRAGMENTS, generator, DURATION);
    expect(calls).toEqual([{ texts: FRAGMENTS.map((f) => f.text), language: "en" }]);
  });

  it("leaves the stored script unchanged", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION);
    expect(getRun(runId)?.script).toBe(SCRIPT);
  });

  it("gives each session its own chunk 1", async () => {
    const runA = newRunId();
    const runB = newRunId("The harbor is quiet at dusk.");
    await registerDecomposition(runA, FRAGMENTS, stubGenerator().generator, DURATION);
    await registerDecomposition(runB, [FRAGMENTS[0]!], stubGenerator().generator, voiceOverDurationOf([FRAGMENTS[0]!]));

    expect(getScenesForRun(runA).map((s) => s.index)).toEqual([1, 2, 3]);
    expect(getScenesForRun(runB).map((s) => s.index)).toEqual([1]);
    expect(getScenesForRun(runA).every((s) => s.runId === runA)).toBe(true);
    expect(getScenesForRun(runB).every((s) => s.runId === runB)).toBe(true);
  });

  it("clears an earlier decomposition failure once a registration succeeds", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, [], stubGenerator().generator, DURATION);
    expect(getRun(runId)?.failure?.phase).toBe("decomposition");

    await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION);

    expect(getRun(runId)?.failure).toBeNull();
  });
});

// request-admitted-clip-duration (JOS-147), group 3 — design Decision 2: the
// requested duration and its over-maximum warning are computed from each
// fragment's interval and stored with the chunk, in the same registration.
describe("Each chunk's requested duration is chosen from its interval (JOS-147)", () => {
  it("stores the admitted duration by smallest speed change and no warning for an ordinary chunk", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION);

    // SPECS: 6 s -> 6 s; 9.5 s -> 10 s (ratio 10/9.5=1.0526 beats 9.5/9=1.0556); 5 s -> 5 s.
    expect(getScenesForRun(runId).map((s) => ({ requestedDurationSeconds: s.requestedDurationSeconds, durationWarning: s.durationWarning }))).toEqual([
      { requestedDurationSeconds: 6, durationWarning: null },
      { requestedDurationSeconds: 10, durationWarning: null },
      { requestedDurationSeconds: 5, durationWarning: null },
    ]);
  });

  it("stores the maximum with exceeds-maximum for an unsplittable chunk, without failing the chunk or the session", async () => {
    const runId = newRunId();
    const fragments = contiguousFragments(specsWith(1, { seconds: 17.4, exception: "unsplittable-sentence" }));
    const result = await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments));

    expect(result.ok).toBe(true);
    const scenes = getScenesForRun(runId);
    expect(scenes[1]).toMatchObject({ status: "submitted", requestedDurationSeconds: 15, durationWarning: "exceeds-maximum" });
    expect(getRun(runId)?.failure).toBeNull();
  });

  it("stays unchanged under a later, different admitted-durations set, and refuses a second registration (AC5)", async () => {
    const runId = newRunId();
    const fragments = contiguousFragments(specsWith(1, { seconds: 17.4, exception: "unsplittable-sentence" }));
    const interval = fragments[1]!.narrationInterval;
    await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments));
    const storedBefore = getScenesForRun(runId).map((s) => ({ requestedDurationSeconds: s.requestedDurationSeconds, durationWarning: s.durationWarning }));
    expect(storedBefore[1]).toEqual({ requestedDurationSeconds: 15, durationWarning: "exceeds-maximum" });

    // A later build with a wider admitted set (5..20) would now choose 17 s for the same interval.
    const wide = Array.from({ length: 16 }, (_, i) => 5 + i);
    const widerChoice = requestedClipDuration(interval, wide);
    expect(widerChoice.seconds).toBe(17);
    expect(widerChoice.warning).toBeNull();

    // The already-registered chunk is untouched by that: a second registration is refused outright.
    const second = await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments));
    expect(second).toEqual({ ok: false, reason: "already-registered" });
    expect(getScenesForRun(runId).map((s) => ({ requestedDurationSeconds: s.requestedDurationSeconds, durationWarning: s.durationWarning }))).toEqual(
      storedBefore,
    );
  });
});

describe("Each chunk's speed-adjustment factor is derived from its requested duration (record-speed-adjustment-factor, JOS-148)", () => {
  it("stores the factor with no warning for an ordinary chunk, within the limit", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION);

    // SPECS: 6 s -> 6 s (factor 1); 9.5 s -> 10 s (factor 10/9.5); 5 s -> 5 s (factor 1).
    const scenes = getScenesForRun(runId);
    expect(scenes[0]!.speedFactor).toBe(1);
    expect(scenes[0]!.speedFactorWarning).toBeNull();
    expect(scenes[1]!.speedFactor).toBeCloseTo(10 / 9.5, 10);
    expect(scenes[1]!.speedFactorWarning).toBeNull();
    expect(scenes[2]!.speedFactor).toBe(1);
    expect(scenes[2]!.speedFactorWarning).toBeNull();
  });

  it("stores a factor under the limit with no warning for the unsplittable-sentence case (17.4 s -> 15 s)", async () => {
    const runId = newRunId();
    const fragments = contiguousFragments(specsWith(1, { seconds: 17.4, exception: "unsplittable-sentence" }));
    await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments));

    const scenes = getScenesForRun(runId);
    expect(scenes[1]!.speedFactor).toBeCloseTo(17.4 / 15, 10);
    expect(scenes[1]!.speedFactorWarning).toBeNull();
  });

  it("records exceeds-limit, without failing the chunk or the session, when the factor exceeds SPEED_FACTOR_LIMIT", async () => {
    const runId = newRunId();
    // 35 s narrated, capped at the 15 s admitted maximum: factor 35/15 ≈ 2.33, over the 2.0 limit.
    const fragments = contiguousFragments(specsWith(1, { seconds: 35, exception: "unsplittable-sentence" }));
    const result = await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments));

    expect(result.ok).toBe(true);
    const scenes = getScenesForRun(runId);
    expect(scenes[1]).toMatchObject({ status: "submitted", requestedDurationSeconds: 15, speedFactorWarning: "exceeds-limit" });
    expect(scenes[1]!.speedFactor).toBeCloseTo(35 / 15, 10);
    expect(getRun(runId)?.failure).toBeNull();
  });

  it("carries both duration_warning and speed_factor_warning independently when both apply", async () => {
    const runId = newRunId();
    const fragments = contiguousFragments(specsWith(1, { seconds: 35, exception: "unsplittable-sentence" }));
    await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments));

    const scene = getScenesForRun(runId)[1]!;
    expect(scene.durationWarning).toBe("exceeds-maximum");
    expect(scene.speedFactorWarning).toBe("exceeds-limit");
  });

  it("gives a scene created without a decomposition no speed factor and no warning", async () => {
    const runId = newRunId();
    const sceneId = randomUUID();
    createScene(sceneId, runId, 1, "success", 0);
    const scene = getScenesForRun(runId)[0]!;
    expect(scene.speedFactor).toBeNull();
    expect(scene.speedFactorWarning).toBeNull();
  });
});

describe("An invalid decomposition is refused as a decomposition failure (AC3)", () => {
  const invalidCases: Array<[string, SegmentedFragment[], string?]> = [
    ["no fragments", []],
    ["an empty fragment", contiguousFragments([{ text: "   ", seconds: 6 }, ...SPECS])],
    ["a fragment below the lower bound without a flag", contiguousFragments(specsWith(0, { seconds: 3 }))],
    ["a fragment above the upper bound without a flag", contiguousFragments(specsWith(1, { seconds: 16 }))],
    [
      "a script-below-lower-bound flag on one of several fragments",
      contiguousFragments(specsWith(0, { seconds: 3, exception: "script-below-lower-bound" })),
    ],
    ["a non-positive duration", contiguousFragments(specsWith(0, { seconds: 0 }))],
    ["fragments that do not reconstruct the script", [FRAGMENTS[0]!, { ...FRAGMENTS[1]!, text: "Fishing boats leave with the tide." }, FRAGMENTS[2]!]],
    ["a fragment missing from the script", FRAGMENTS.slice(0, 2)],
  ];

  it.each(invalidCases)("refuses %s: no chunks, a decomposition failure that does not blame the script", async (_label, fragments) => {
    const runId = newRunId();

    const result = await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments));

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
    expect(getScenesForRun(runId)).toEqual([]);
    const failure = getRun(runId)?.failure;
    expect(failure).toMatchObject({ phase: "decomposition", retryable: true });
    expect(failure?.cause).toMatch(/system/i);
    expect(failure?.cause).not.toMatch(/your script (is|was) (invalid|wrong)|script error/i);
  });

  it("validates the fragments before asking the generator", async () => {
    const runId = newRunId();
    const { generator, calls } = stubGenerator();
    await registerDecomposition(runId, [], generator, DURATION);
    expect(calls).toHaveLength(0);
  });

  it.each<[string, VisualInstructionResult]>([
    ["too few pairs", { kind: "success", pairs: [{ image: "i", video: "v" }] }],
    ["an empty instruction", { kind: "success", pairs: FRAGMENTS.map((_, i) => ({ image: i === 1 ? " " : "i", video: "v" })) }],
    ["invalid output", { kind: "invalid_output", reason: "the reasoning provider's instructions were missing or empty" }],
  ])("refuses %s from the generator, leaving no chunks", async (_label, answer) => {
    const runId = newRunId();
    const result = await registerDecomposition(runId, FRAGMENTS, stubGenerator(() => answer).generator, DURATION);
    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
    expect(getScenesForRun(runId)).toEqual([]);
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable: true });
  });

  it.each<[string, VisualInstructionResult, boolean]>([
    ["a transient provider failure", { kind: "failed_transient", reason: "the reasoning provider answered HTTP 503" }, true],
    ["a not-retryable provider failure", { kind: "failed_not_retryable", reason: "the reasoning provider answered HTTP 401" }, false],
  ])("records %s with its retryability, leaving no chunks", async (_label, answer, retryable) => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, stubGenerator(() => answer).generator, DURATION);
    expect(getScenesForRun(runId)).toEqual([]);
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable });
    expect(getRun(runId)?.failure?.cause).toMatch(/HTTP/);
  });
});

describe("The §6.1.1 exceptions and whitespace (AC3)", () => {
  it("accepts a single fragment below the lower bound flagged script-below-lower-bound", async () => {
    const runId = newRunId("A short script.");
    const result = await registerDecomposition(
      runId,
      contiguousFragments([{ text: "A short script.", seconds: 2.1, exception: "script-below-lower-bound" }]),
      stubGenerator().generator,
      2.1,
    );
    expect(result.ok).toBe(true);
    expect(getScenesForRun(runId)).toHaveLength(1);
  });

  it("accepts a fragment above the upper bound flagged unsplittable-sentence", async () => {
    const runId = newRunId();
    const fragments = contiguousFragments(specsWith(1, { seconds: 17, exception: "unsplittable-sentence" }));
    expect((await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments))).ok).toBe(true);
  });

  it("accepts the exact bounds, 5 and 15 seconds", async () => {
    const runId = newRunId();
    const fragments = contiguousFragments([{ ...SPECS[0]!, seconds: 5 }, { ...SPECS[1]!, seconds: 15 }, SPECS[2]!]);
    expect((await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments))).ok).toBe(true);
  });

  it("reconstructs a script whose whitespace differs (line breaks, double spaces)", async () => {
    const runId = newRunId("The harbor is quiet at dusk.\n\nFishing boats  return with the tide.   Gulls circle overhead.");
    expect((await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION)).ok).toBe(true);
  });

  it("reconstructs a sentence split at a clause boundary", async () => {
    const runId = newRunId("Boats return, and gulls circle.");
    const fragments = contiguousFragments([
      { text: "Boats return,", seconds: 5 },
      { text: "and gulls circle.", seconds: 5 },
    ]);
    expect((await registerDecomposition(runId, fragments, stubGenerator().generator, voiceOverDurationOf(fragments))).ok).toBe(true);
  });
});

// assign-narration-intervals (JOS-143), group 3 — PRD §7.3, AC19: the intervals
// must partition the voice-over before anything is generated or written
// (design Decision 2). Exact comparisons: every boundary comes from one array.
describe("The narration intervals must partition the voice-over (JOS-143)", () => {
  const withIntervals = (intervals: Array<[number, number]>): SegmentedFragment[] =>
    FRAGMENTS.map((fragment, position) => ({
      ...fragment,
      narrationInterval: { startSeconds: intervals[position]![0], endSeconds: intervals[position]![1] },
    }));

  it("registers a valid partition", async () => {
    const runId = newRunId();
    const fragments = withIntervals([[0, 7.4], [7.4, 15], [15, 21.3]]);

    const result = await registerDecomposition(runId, fragments, stubGenerator().generator, 21.3);

    expect(result.ok).toBe(true);
    expect(getScenesForRun(runId)).toHaveLength(3);
  });

  const partitionCases: Array<[string, Array<[number, number]>, number, RegExp]> = [
    ["a gap between two intervals", [[0, 7.4], [7.6, 15], [15, 21.3]], 21.3, /scene 2.*scene 1/],
    ["an overlap between two intervals", [[0, 7.4], [7.2, 15], [15, 21.3]], 21.3, /scene 2.*scene 1/],
    ["a first interval that does not start at 0", [[0.1, 7.4], [7.4, 15], [15, 21.3]], 21.3, /scene 1.*0/],
    ["a last interval that ends before the voice-over does", [[0, 7.4], [7.4, 15], [15, 21.3]], 21.5, /scene 3.*21\.5/],
    ["a last interval that ends after the voice-over does", [[0, 7.4], [7.4, 15], [15, 21.3]], 21.1, /scene 3.*21\.1/],
    ["an empty interval", [[0, 7.4], [7.4, 7.4], [7.4, 21.3]], 21.3, /scene 2/],
  ];

  it.each(partitionCases)(
    "refuses %s: retryable decomposition failure naming the scene, no instruction call, no chunks",
    async (_label, intervals, voiceOverDuration, expectedCause) => {
      const runId = newRunId();
      const { generator, calls } = stubGenerator();

      const result = await registerDecomposition(runId, withIntervals(intervals), generator, voiceOverDuration);

      expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
      expect(calls).toEqual([]);
      expect(getScenesForRun(runId)).toEqual([]);
      const failure = getRun(runId)?.failure;
      expect(failure).toMatchObject({ phase: "decomposition", retryable: true });
      expect(failure?.cause).toMatch(expectedCause);
      expect(failure?.cause).toMatch(/not an error in your script/i);
    },
  );

  it.each([[0], [-3], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "refuses a voice-over duration of %s as a non-retryable decomposition failure",
    async (voiceOverDuration) => {
      const runId = newRunId();
      const { generator, calls } = stubGenerator();

      const result = await registerDecomposition(runId, FRAGMENTS, generator, voiceOverDuration);

      expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
      expect(calls).toEqual([]);
      expect(getScenesForRun(runId)).toEqual([]);
      expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable: false });
    },
  );
});

describe("Registration is refused without a valid target (AC4)", () => {
  it("refuses a session that already has chunks and leaves them unchanged", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION);
    const before = getScenesForRun(runId);

    const { generator, calls } = stubGenerator();
    const result = await registerDecomposition(runId, FRAGMENTS, generator, DURATION);

    expect(result).toEqual({ ok: false, reason: "already-registered" });
    expect(calls).toHaveLength(0);
    expect(getScenesForRun(runId)).toEqual(before);
  });

  it("refuses a session that already has a scene created some other way", async () => {
    const runId = newRunId();
    createScene(randomUUID(), runId, 1, "success", 100);
    expect(await registerDecomposition(runId, FRAGMENTS, stubGenerator().generator, DURATION)).toEqual({ ok: false, reason: "already-registered" });
  });

  it("loses a race cleanly: if another registration lands first, nothing of this one is written", async () => {
    const runId = newRunId();
    const racingSceneId = randomUUID();
    // The competing registration lands while this one waits for its instructions.
    const { generator } = stubGenerator((texts) => {
      createScene(racingSceneId, runId, 1, "success", 100);
      return { kind: "success", pairs: texts.map(() => ({ image: "i", video: "v" })) };
    });

    const result = await registerDecomposition(runId, FRAGMENTS, generator, DURATION);

    expect(result).toEqual({ ok: false, reason: "already-registered" });
    expect(getScenesForRun(runId).map((s) => s.id)).toEqual([racingSceneId]);
  });

  it("refuses an unknown session without writing anything", async () => {
    const { generator, calls } = stubGenerator();
    expect(await registerDecomposition("no-such-session", FRAGMENTS, generator, DURATION)).toEqual({ ok: false, reason: "unknown-session" });
    expect(calls).toHaveLength(0);
  });
});
