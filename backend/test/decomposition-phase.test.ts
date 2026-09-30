import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import {
  createRun,
  getNarrationTimestamps,
  getRun,
  getScenesForRun,
  insertVoiceOver,
  resetAll,
  resolveArtefactPath,
  writeArtefactOnce,
} from "../src/db.ts";
import { runDecompositionPhase, segmentStoredTimestamps } from "../src/decompositionPhase.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { deriveSessionState } from "../src/orchestrator.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { writeFileSync } from "node:fs";

// segment-script-into-chunks (JOS-140), group 5 — design Decisions 5 and 7:
// segmenting a session's stored timestamps and registering the chunks, a
// script with no valid grouping recorded as a not-retryable decomposition
// failure, and the phase entry point that obtains the timestamps first.

const STEP = 0.25;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);
// 28 and 35 characters at 0.25 s each: two sentences of about 7.1 s and 8.9 s, which cannot share a fragment (16 s).
const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
// 56 and 8 characters: about 14.1 s and 2.1 s. The short one cannot follow (16.3 s) and cannot stand alone.
const UNGROUPABLE_SCRIPT = `${"W".repeat(55)}. Go home.`;

beforeEach(() => {
  resetAll();
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

/** A session whose narration is stored; native timestamps are stored too unless `withNative` is false. */
function newNarratedSession(script = SCRIPT, withNative = true) {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Decomposition test", script, "en");
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
  return { runId, projectFolder };
}

function stubAlignment(answer?: (script: string) => AlignmentResult) {
  const calls: string[] = [];
  const provider: AlignmentProvider = {
    async align(_audio, script) {
      calls.push(script);
      return answer
        ? answer(script)
        : { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) };
    },
  };
  return { provider, calls };
}

function stubGenerator() {
  const calls: Array<readonly string[]> = [];
  const generator: VisualInstructionGenerator = {
    async generate(texts) {
      calls.push(texts);
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
  return { generator, calls };
}

const stateOf = (runId: string) => deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure);

/** A session with its timestamps already stored, by the JOS-139 step. */
async function newSessionWithStoredTimestamps(script = SCRIPT) {
  const session = newNarratedSession(script);
  const result = await obtainNarrationTimestamps(session.runId, stubAlignment().provider);
  expect(result.ok).toBe(true);
  return session;
}

describe("Segmenting the stored timestamps", () => {
  it("registers the fragments as chunks, in order, with each sentence's own text", async () => {
    const { runId } = await newSessionWithStoredTimestamps();
    const { generator, calls } = stubGenerator();

    const result = await segmentStoredTimestamps(runId, generator);

    expect(result.ok).toBe(true);
    expect(getScenesForRun(runId).map((scene) => ({ index: scene.index, prompt: scene.prompt }))).toEqual([
      { index: 1, prompt: "The harbor is quiet at dusk." },
      { index: 2, prompt: "Fishing boats return with the tide." },
    ]);
    expect(calls).toEqual([["The harbor is quiet at dusk.", "Fishing boats return with the tide."]]);
  });

  it("leaves the session in chunks-processing", async () => {
    const { runId } = await newSessionWithStoredTimestamps();
    await segmentStoredTimestamps(runId, stubGenerator().generator);
    expect(stateOf(runId)).toEqual({ state: "chunks-processing" });
  });

  it("uses the stored timestamps and the narration's measured duration", async () => {
    const { runId } = await newSessionWithStoredTimestamps();
    const before = getNarrationTimestamps(runId);
    await segmentStoredTimestamps(runId, stubGenerator().generator);
    expect(getNarrationTimestamps(runId)).toEqual(before);
  });
});

describe("A script with no valid grouping (Decision 5)", () => {
  async function ungroupable() {
    const { runId } = await newSessionWithStoredTimestamps(UNGROUPABLE_SCRIPT);
    const { generator, calls } = stubGenerator();
    const result = await segmentStoredTimestamps(runId, generator);
    return { runId, result, calls };
  }

  it("records a not-retryable decomposition failure", async () => {
    const { runId, result } = await ungroupable();
    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed", failure: { phase: "decomposition", retryable: false } });
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable: false });
    expect(stateOf(runId)).toMatchObject({ state: "failed", failedPhase: "decomposition" });
  });

  it("words the cause as the system's, never the script's", async () => {
    const { runId } = await ungroupable();
    const cause = getRun(runId)?.failure?.cause ?? "";
    expect(cause).toMatch(/system/i);
    expect(cause).toMatch(/not an error in your script/i);
  });

  it("registers nothing and never calls the instruction generator", async () => {
    const { runId, calls } = await ungroupable();
    expect(getScenesForRun(runId)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("records a not-retryable failure when the stored timestamps file cannot be read", async () => {
    const { runId, projectFolder } = await newSessionWithStoredTimestamps();
    writeFileSync(resolveArtefactPath(projectFolder, "narration-timestamps.json"), "not json");
    const { generator, calls } = stubGenerator();

    const result = await segmentStoredTimestamps(runId, generator);

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed", failure: { phase: "decomposition", retryable: false } });
    expect(calls).toHaveLength(0);
    expect(getScenesForRun(runId)).toHaveLength(0);
  });
});

describe("A stored timestamps file of an unexpected shape", () => {
  it("records a not-retryable failure, like an unreadable one", async () => {
    const { runId, projectFolder } = await newSessionWithStoredTimestamps();
    writeFileSync(resolveArtefactPath(projectFolder, "narration-timestamps.json"), JSON.stringify({ mechanism: "unknown", characters: "none" }));
    const { generator, calls } = stubGenerator();

    const result = await segmentStoredTimestamps(runId, generator);

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed", failure: { phase: "decomposition", retryable: false } });
    expect(calls).toHaveLength(0);
  });
});

describe("Refusals", () => {
  it("refuses a session without stored timestamps, recording nothing", async () => {
    const { runId } = newNarratedSession();
    const { generator, calls } = stubGenerator();

    expect(await segmentStoredTimestamps(runId, generator)).toEqual({ ok: false, reason: "no-timestamps" });
    expect(calls).toHaveLength(0);
    expect(getRun(runId)?.failure).toBeNull();
    expect(getScenesForRun(runId)).toHaveLength(0);
  });

  it("refuses a session that already has chunks, leaving them as they are", async () => {
    const { runId } = await newSessionWithStoredTimestamps();
    await segmentStoredTimestamps(runId, stubGenerator().generator);
    const chunksBefore = getScenesForRun(runId);
    const { generator, calls } = stubGenerator();

    expect(await segmentStoredTimestamps(runId, generator)).toEqual({ ok: false, reason: "already-registered" });
    expect(calls).toHaveLength(0);
    expect(getScenesForRun(runId)).toEqual(chunksBefore);
  });

  it("does not record a failure on a session that already has chunks, even if its script could not be grouped", async () => {
    const { runId } = await newSessionWithStoredTimestamps(UNGROUPABLE_SCRIPT);
    await registerDecomposition(
      runId,
      [{ text: UNGROUPABLE_SCRIPT, narrationInterval: { startSeconds: 0, endSeconds: 15 }, exception: "unsplittable-sentence" }],
      stubGenerator().generator,
    );
    expect(getScenesForRun(runId)).toHaveLength(1);

    expect(await segmentStoredTimestamps(runId, stubGenerator().generator)).toEqual({ ok: false, reason: "already-registered" });
    expect(getRun(runId)?.failure).toBeNull();
    expect(stateOf(runId)).toEqual({ state: "chunks-processing" });
  });

  it("refuses an unknown session", async () => {
    expect(await segmentStoredTimestamps("no-such-session", stubGenerator().generator)).toEqual({ ok: false, reason: "unknown-session" });
  });

  it("does not register when the chunks were registered by another route first", async () => {
    const { runId } = await newSessionWithStoredTimestamps();
    await registerDecomposition(
      runId,
      [
        { text: "The harbor is quiet at dusk.", narrationInterval: { startSeconds: 0, endSeconds: 7 } },
        { text: "Fishing boats return with the tide.", narrationInterval: { startSeconds: 7, endSeconds: 16 } },
      ],
      stubGenerator().generator,
    );
    expect(await segmentStoredTimestamps(runId, stubGenerator().generator)).toEqual({ ok: false, reason: "already-registered" });
  });
});

describe("The decomposition phase (Decision 7)", () => {
  it("obtains the timestamps first when they are missing, then registers the chunks", async () => {
    const { runId } = newNarratedSession(SCRIPT, false);
    const alignment = stubAlignment();
    const { generator, calls } = stubGenerator();

    const result = await runDecompositionPhase(runId, { alignmentProvider: alignment.provider, instructionGenerator: generator });

    expect(result.ok).toBe(true);
    expect(alignment.calls).toHaveLength(1);
    expect(getNarrationTimestamps(runId)).toMatchObject({ mechanism: "alignment" });
    expect(getScenesForRun(runId)).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(stateOf(runId)).toEqual({ state: "chunks-processing" });
  });

  it("skips obtaining them when they are stored", async () => {
    const { runId } = await newSessionWithStoredTimestamps();
    const alignment = stubAlignment();

    const result = await runDecompositionPhase(runId, { alignmentProvider: alignment.provider, instructionGenerator: stubGenerator().generator });

    expect(result.ok).toBe(true);
    expect(alignment.calls).toHaveLength(0);
    expect(getScenesForRun(runId)).toHaveLength(2);
  });

  it("uses the native timestamps when the narration has them, without forced alignment", async () => {
    const { runId } = newNarratedSession();
    const alignment = stubAlignment();

    await runDecompositionPhase(runId, { alignmentProvider: alignment.provider, instructionGenerator: stubGenerator().generator });

    expect(alignment.calls).toHaveLength(0);
    expect(getNarrationTimestamps(runId)).toMatchObject({ mechanism: "native" });
  });

  it("stops when the timestamps cannot be obtained: no segmentation, no chunks, that failure recorded", async () => {
    const { runId } = newNarratedSession(SCRIPT, false);
    const alignment = stubAlignment(() => ({ kind: "failed_not_retryable", reason: "the provider refused the request (HTTP 401)" }));
    const { generator, calls } = stubGenerator();

    const result = await runDecompositionPhase(runId, { alignmentProvider: alignment.provider, instructionGenerator: generator });

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed", failure: { phase: "decomposition", retryable: false } });
    expect(getRun(runId)?.failure?.cause).toMatch(/timestamps/i);
    expect(calls).toHaveLength(0);
    expect(getScenesForRun(runId)).toHaveLength(0);
    expect(getNarrationTimestamps(runId)).toBeUndefined();
  });

  it("recovers on a later run once the timestamps can be obtained, clearing the earlier failure", async () => {
    const { runId } = newNarratedSession(SCRIPT, false);
    const failing = stubAlignment(() => ({ kind: "failed_transient", reason: "the provider was unavailable (HTTP 503)" }));
    const first = await runDecompositionPhase(runId, { alignmentProvider: failing.provider, instructionGenerator: stubGenerator().generator });
    expect(first.ok).toBe(false);
    expect(stateOf(runId)).toMatchObject({ state: "failed", failedPhase: "decomposition" });

    const second = await runDecompositionPhase(runId, { alignmentProvider: stubAlignment().provider, instructionGenerator: stubGenerator().generator });

    expect(second.ok).toBe(true);
    expect(getRun(runId)?.failure).toBeNull();
    expect(stateOf(runId)).toEqual({ state: "chunks-processing" });
  });

  it("refuses a session with no narration", async () => {
    const runId = randomUUID();
    createRun(runId, "No narration", SCRIPT, "en");
    const result = await runDecompositionPhase(runId, { alignmentProvider: stubAlignment().provider, instructionGenerator: stubGenerator().generator });
    expect(result).toEqual({ ok: false, reason: "no-voice-over" });
    expect(getRun(runId)?.failure).toBeNull();
  });

  it("refuses an unknown session", async () => {
    const result = await runDecompositionPhase("no-such-session", { alignmentProvider: stubAlignment().provider, instructionGenerator: stubGenerator().generator });
    expect(result).toEqual({ ok: false, reason: "unknown-session" });
  });

  it("refuses a session that already has chunks", async () => {
    const { runId } = await newSessionWithStoredTimestamps();
    await runDecompositionPhase(runId, { alignmentProvider: stubAlignment().provider, instructionGenerator: stubGenerator().generator });
    const result = await runDecompositionPhase(runId, { alignmentProvider: stubAlignment().provider, instructionGenerator: stubGenerator().generator });
    expect(result).toEqual({ ok: false, reason: "already-registered" });
  });
});
