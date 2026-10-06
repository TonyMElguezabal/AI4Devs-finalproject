import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import {
  createRun,
  getRun,
  getScenesForRun,
  getStageAttempts,
  insertVoiceOver,
  recordStageAttempt,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import { segmentStoredTimestamps } from "../src/decompositionPhase.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import type { StageAttempt } from "../src/types.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";

// retry-decomposition (JOS-156), group 2 — design Decisions 3 and 4: the
// division step records one `decomposition` attempt per try, and both steps
// complete an attempt they are handed instead of recording a second one.

const STEP = 0.25;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);
const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
const UNGROUPABLE_SCRIPT = `${"W".repeat(55)}. Go home.`;

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetImageProviderRegistry();
  setVideoStageStartDelayMs(9_999_999);
  setImageProviderRegistry({
    defaultIdentifier: "held-image-adapter",
    adapters: { "held-image-adapter": { generate: () => new Promise(() => {}) } },
  });
});

function nativeFor(text: string) {
  const characters = [...text];
  return {
    audio_base64: "ignored",
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => i * STEP),
      character_end_times_seconds: characters.map((_, i) => (i + 1) * STEP),
    },
  };
}

function newNarratedSession(script = SCRIPT, withNative = true) {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Attempt test", script, "en");
  writeArtefactOnce(projectFolder, "voice-over.mp3", MP3);
  if (withNative) writeArtefactOnce(projectFolder, "voice-over.timestamps.json", JSON.stringify(nativeFor(script)));
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: withNative ? "voice-over.timestamps.json" : null,
    durationSeconds: script.length * STEP,
    sizeBytes: MP3.length,
    nativeTimestampsAvailable: withNative,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  });
  return runId;
}

function alignment(answer?: (script: string) => AlignmentResult): AlignmentProvider {
  return {
    async align(_audio, script) {
      return answer
        ? answer(script)
        : { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) };
    },
  };
}

function generatorAnswering(answer: (texts: readonly string[]) => VisualInstructionResult, onCall?: () => void): VisualInstructionGenerator {
  return {
    async generate(texts) {
      onCall?.();
      return answer(texts);
    },
  };
}

const succeeding = (texts: readonly string[]): VisualInstructionResult => ({
  kind: "success",
  pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })),
});
const failingTransiently = (): VisualInstructionResult => ({ kind: "failed_transient", reason: "the reasoning provider answered HTTP 503" });
const failingNotRetryably = (): VisualInstructionResult => ({ kind: "failed_not_retryable", reason: "the reasoning provider answered HTTP 401" });

async function sessionWithStoredTimestamps(script = SCRIPT): Promise<string> {
  const runId = newNarratedSession(script);
  expect((await obtainNarrationTimestamps(runId, alignment())).ok).toBe(true);
  return runId;
}

/** An attempt as the scheduler hands it to a sender: already in flight, in the given cycle. */
function claimedAttempt(runId: string, stage: "timestamps" | "decomposition", cycle: number): StageAttempt {
  const at = new Date().toISOString();
  return recordStageAttempt({ runId, stage, providerId: "claimed-provider", queuedAt: at, sentAt: at, cycle, trigger: "manual" });
}

describe("The division step records its attempts (2.1)", () => {
  it("records one transient attempt for a retryable failure, and the failure names cycle 1 and two attempts", async () => {
    const runId = await sessionWithStoredTimestamps();

    await segmentStoredTimestamps(runId, generatorAnswering(failingTransiently));

    const attempts = getStageAttempts(runId, "decomposition");
    expect(attempts).toHaveLength(1);
    // The timestamps attempt came first in the shared instance, so this is attempt 2 of cycle 1.
    expect(attempts[0]).toMatchObject({ cycle: 1, sequenceInCycle: 2, trigger: "initial", providerId: "openai-decomposition", outcome: "transient" });
    expect(attempts[0]!.errorMessage).toContain("HTTP 503");
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable: true, cycle: 1, attemptsInCycle: 2 });
  });

  it("records a not-retryable attempt for a not-retryable instruction failure", async () => {
    const runId = await sessionWithStoredTimestamps();

    await segmentStoredTimestamps(runId, generatorAnswering(failingNotRetryably));

    expect(getStageAttempts(runId, "decomposition").map((attempt) => attempt.outcome)).toEqual(["not-retryable"]);
    expect(getRun(runId)?.failure).toMatchObject({ retryable: false, manualRetryAvailable: false });
  });

  it("records a not-retryable attempt when the script cannot be segmented", async () => {
    const runId = await sessionWithStoredTimestamps(UNGROUPABLE_SCRIPT);

    await segmentStoredTimestamps(runId, generatorAnswering(succeeding));

    expect(getStageAttempts(runId, "decomposition").map((attempt) => attempt.outcome)).toEqual(["not-retryable"]);
  });

  it("records a success attempt when the chunks are registered", async () => {
    const runId = await sessionWithStoredTimestamps();

    const result = await segmentStoredTimestamps(runId, generatorAnswering(succeeding));

    expect(result.ok).toBe(true);
    expect(getStageAttempts(runId, "decomposition").map((attempt) => attempt.outcome)).toEqual(["success"]);
    expect(getScenesForRun(runId)).toHaveLength(2);
  });

  it("has the attempt in flight before the instruction generator is called", async () => {
    const runId = await sessionWithStoredTimestamps();
    let outcomesSeenByTheGenerator: string[] = [];

    await segmentStoredTimestamps(
      runId,
      generatorAnswering(succeeding, () => {
        outcomesSeenByTheGenerator = getStageAttempts(runId, "decomposition").map((attempt) => attempt.outcome);
      }),
    );

    expect(outcomesSeenByTheGenerator).toEqual(["in-flight"]);
  });

  it("records no attempt when the step does not run: unknown session, no timestamps, or chunks already registered", async () => {
    const withoutTimestamps = newNarratedSession();
    await segmentStoredTimestamps(withoutTimestamps, generatorAnswering(succeeding));
    expect(getStageAttempts(withoutTimestamps, "decomposition")).toHaveLength(0);

    const registered = await sessionWithStoredTimestamps();
    await segmentStoredTimestamps(registered, generatorAnswering(succeeding));
    await segmentStoredTimestamps(registered, generatorAnswering(succeeding));
    expect(getStageAttempts(registered, "decomposition")).toHaveLength(1);

    expect(await segmentStoredTimestamps(randomUUID(), generatorAnswering(succeeding))).toEqual({ ok: false, reason: "unknown-session" });
  });

  it("names the claimed attempt's cycle in the failure it writes", async () => {
    const runId = await sessionWithStoredTimestamps();
    const claimed = claimedAttempt(runId, "decomposition", 2);

    await segmentStoredTimestamps(runId, generatorAnswering(failingTransiently), undefined, claimed);

    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", cycle: 2, attemptsInCycle: 1 });
  });
});

describe("Both steps complete a claimed attempt instead of recording a second one (2.2)", () => {
  it("division: completes the claimed attempt as success", async () => {
    const runId = await sessionWithStoredTimestamps();
    const claimed = claimedAttempt(runId, "decomposition", 2);

    const result = await segmentStoredTimestamps(runId, generatorAnswering(succeeding), undefined, claimed);

    expect(result.ok).toBe(true);
    expect(getStageAttempts(runId, "decomposition")).toEqual([expect.objectContaining({ id: claimed.id, outcome: "success" })]);
  });

  it("division: completes the claimed attempt as transient on a retryable failure", async () => {
    const runId = await sessionWithStoredTimestamps();
    const claimed = claimedAttempt(runId, "decomposition", 2);

    await segmentStoredTimestamps(runId, generatorAnswering(failingTransiently), undefined, claimed);

    expect(getStageAttempts(runId, "decomposition")).toEqual([expect.objectContaining({ id: claimed.id, outcome: "transient" })]);
  });

  it("division: called without a claimed attempt, records its own", async () => {
    const runId = await sessionWithStoredTimestamps();
    await segmentStoredTimestamps(runId, generatorAnswering(succeeding));
    expect(getStageAttempts(runId, "decomposition")).toHaveLength(1);
  });

  it("timestamps: completes the claimed attempt as success and records no second one", async () => {
    const runId = newNarratedSession();
    const claimed = claimedAttempt(runId, "timestamps", 2);

    const result = await obtainNarrationTimestamps(runId, alignment(), undefined, claimed);

    expect(result.ok).toBe(true);
    expect(getStageAttempts(runId, "timestamps")).toEqual([expect.objectContaining({ id: claimed.id, outcome: "success" })]);
  });

  it("timestamps: completes the claimed attempt as transient and names its cycle in the failure", async () => {
    const runId = newNarratedSession(SCRIPT, false);
    const claimed = claimedAttempt(runId, "timestamps", 2);

    await obtainNarrationTimestamps(runId, alignment(() => ({ kind: "failed_transient", reason: "alignment answered HTTP 503" })), undefined, claimed);

    expect(getStageAttempts(runId, "timestamps")).toEqual([expect.objectContaining({ id: claimed.id, outcome: "transient" })]);
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable: true, cycle: 2, attemptsInCycle: 1 });
  });

  it("timestamps: called without a claimed attempt, records its own", async () => {
    const runId = newNarratedSession();
    await obtainNarrationTimestamps(runId, alignment());
    expect(getStageAttempts(runId, "timestamps")).toHaveLength(1);
  });
});
