import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import {
  createRun,
  getNarrationTimestamps,
  getRun,
  getScenesForRun,
  getStageAttempts,
  getVoiceOver,
  insertVoiceOver,
  resetAll,
  resolveArtefactPath,
  writeArtefactOnce,
} from "../src/db.ts";
import { resetDecompositionDependencies, setDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { segmentStoredTimestamps } from "../src/decompositionPhase.ts";
import { retryDecomposition } from "../src/decompositionRetry.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { resetVideoStageStartDelayMs, setVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";

// retry-decomposition (JOS-156), group 4 — design Decision 4: each step re-run
// through the retry, on the stored audio and the locked script, and (AC3) the
// voice-over untouched by either.

const STEP = 0.25;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);
const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
const NATIVE_FILE = "voice-over.timestamps.json";

const voiceStub = createStubVoiceProvider("success");

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetImageProviderRegistry();
  resetDecompositionDependencies();
  setVideoStageStartDelayMs(9_999_999);
  setImageProviderRegistry({
    defaultIdentifier: "held-image-adapter",
    adapters: { "held-image-adapter": { generate: () => new Promise(() => {}) } },
  });
  voiceStub.calls.length = 0;
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": voiceStub } });
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function nativeFor(text: string): string {
  const characters = [...text];
  return JSON.stringify({
    audio_base64: "ignored",
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => i * STEP),
      character_end_times_seconds: characters.map((_, i) => (i + 1) * STEP),
    },
  });
}

/** A narrated session. `nativeText` is what the voice provider's native timestamps spell: the script when usable. */
function newNarratedSession(nativeText: string | null = null): string {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Steps test", SCRIPT, "en");
  writeArtefactOnce(projectFolder, "voice-over.mp3", MP3);
  if (nativeText !== null) writeArtefactOnce(projectFolder, NATIVE_FILE, nativeFor(nativeText));
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: nativeText === null ? null : NATIVE_FILE,
    durationSeconds: SCRIPT.length * STEP,
    sizeBytes: MP3.length,
    nativeTimestampsAvailable: nativeText !== null,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  });
  return runId;
}

function alignment(answer?: () => AlignmentResult) {
  const calls: string[] = [];
  const provider: AlignmentProvider = {
    async align(_audio, script) {
      calls.push(script);
      return answer
        ? answer()
        : { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) };
    },
  };
  return { provider, calls };
}

function generator(answer?: () => VisualInstructionResult) {
  const calls: Array<readonly string[]> = [];
  const instance: VisualInstructionGenerator = {
    async generate(texts) {
      calls.push(texts);
      return answer ? answer() : { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
  return { generator: instance, calls };
}

const transientAlignment = (): AlignmentResult => ({ kind: "failed_transient", reason: "alignment answered HTTP 503" });
const transientInstructions = (): VisualInstructionResult => ({ kind: "failed_transient", reason: "the reasoning provider answered HTTP 503" });

const stateOf = (runId: string) => toSnapshot(runId)?.session.state;

function voiceFingerprint(runId: string) {
  const run = getRun(runId)!;
  const voiceOver = getVoiceOver(runId)!;
  const hash = (path: string) => createHash("sha256").update(readFileSync(resolveArtefactPath(run.projectFolder, path))).digest("hex");
  return {
    row: voiceOver,
    mp3: hash(voiceOver.audioPath),
    native: voiceOver.timestampsPath ? hash(voiceOver.timestampsPath) : null,
  };
}

describe("The timestamps step through the retry (4.1)", () => {
  it("obtains the timestamps from the same MP3 after a failed alignment, and registers the chunks", async () => {
    const runId = newNarratedSession();
    await obtainNarrationTimestamps(runId, alignment(transientAlignment).provider);
    expect(stateOf(runId)).toBe("failed");
    const aligner = alignment();
    const divider = generator();
    setDecompositionDependencies({ alignmentProvider: aligner.provider, instructionGenerator: divider.generator });

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(aligner.calls).toEqual([SCRIPT]);
    expect(getNarrationTimestamps(runId)?.mechanism).toBe("alignment");
  });

  it("goes straight to the alignment provider after native timestamps were unusable, without reading the native file again", async () => {
    const runId = newNarratedSession("not the script at all");
    await obtainNarrationTimestamps(runId, alignment(transientAlignment).provider);
    expect(stateOf(runId)).toBe("failed");
    expect(getStageAttempts(runId, "timestamps")[0]).toMatchObject({ errorCode: "native-unusable" });
    // If the retry read the native file now, it would be usable and be stored as the native mechanism.
    writeFileSync(resolveArtefactPath(getRun(runId)!.projectFolder, NATIVE_FILE), nativeFor(SCRIPT));
    const aligner = alignment();
    setDecompositionDependencies({ alignmentProvider: aligner.provider, instructionGenerator: generator().generator });

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(aligner.calls).toEqual([SCRIPT]);
    expect(getNarrationTimestamps(runId)?.mechanism).toBe("alignment");
  });
});

describe("The division step through the retry (4.2)", () => {
  async function failedDivision() {
    const runId = newNarratedSession(SCRIPT);
    expect((await obtainNarrationTimestamps(runId, alignment().provider)).ok).toBe(true);
    await segmentStoredTimestamps(runId, generator(transientInstructions).generator);
    expect(stateOf(runId)).toBe("failed");
    return runId;
  }

  it("divides the same script from the same timestamps, and reaches chunks-processing", async () => {
    const runId = await failedDivision();
    const run = getRun(runId)!;
    const timestampsBefore = getNarrationTimestamps(runId);
    const aligner = alignment();
    const divider = generator();
    setDecompositionDependencies({ alignmentProvider: aligner.provider, instructionGenerator: divider.generator });

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(getScenesForRun(runId).map((scene) => scene.prompt).join(" ")).toBe(SCRIPT);
    expect(divider.calls).toEqual([["The harbor is quiet at dusk.", "Fishing boats return with the tide."]]);
    expect(stateOf(runId)).toBe("chunks-processing");
    expect(getNarrationTimestamps(runId)).toEqual(timestampsBefore);
    const after = getRun(runId)!;
    expect({ script: after.script, title: after.title, language: after.language }).toEqual({
      script: run.script,
      title: run.title,
      language: run.language,
    });
    expect(aligner.calls).toHaveLength(0);
  });

  it("adds no timestamps attempt, and records the new decomposition attempt in cycle 2 beside the first", async () => {
    const runId = await failedDivision();
    const timestampAttemptsBefore = getStageAttempts(runId, "timestamps").length;
    setDecompositionDependencies({ alignmentProvider: alignment().provider, instructionGenerator: generator().generator });

    retryDecomposition(runId);

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(getStageAttempts(runId, "timestamps")).toHaveLength(timestampAttemptsBefore);
    expect(getStageAttempts(runId, "decomposition").map((attempt) => ({ cycle: attempt.cycle, outcome: attempt.outcome }))).toEqual([
      { cycle: 1, outcome: "transient" },
      { cycle: 2, outcome: "success" },
    ]);
  });
});

describe("The voice-over is never touched (4.3, AC3)", () => {
  const cases = [
    { step: "timestamps", outcome: "succeeds" },
    { step: "timestamps", outcome: "fails again" },
    { step: "division", outcome: "succeeds" },
    { step: "division", outcome: "fails again" },
  ] as const;

  it.each(cases)("a retry of the $step step that $outcome sends nothing to the voice provider and changes no voice-over file or row", async ({ step, outcome }) => {
    const succeeds = outcome === "succeeds";
    const runId = newNarratedSession(SCRIPT);
    if (step === "timestamps") {
      // Native timestamps for the script are usable, so make the first attempt fail on the file, then the retry has none to read.
      writeFileSync(resolveArtefactPath(getRun(runId)!.projectFolder, NATIVE_FILE), nativeFor("something else entirely"));
      await obtainNarrationTimestamps(runId, alignment(transientAlignment).provider);
    } else {
      expect((await obtainNarrationTimestamps(runId, alignment().provider)).ok).toBe(true);
      await segmentStoredTimestamps(runId, generator(transientInstructions).generator);
    }
    expect(stateOf(runId)).toBe("failed");
    const before = voiceFingerprint(runId);
    setDecompositionDependencies({
      alignmentProvider: alignment(succeeds ? undefined : transientAlignment).provider,
      instructionGenerator: generator(succeeds ? undefined : transientInstructions).generator,
    });

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: false });

    await waitFor(() =>
      succeeds
        ? getScenesForRun(runId).length === 2
        : [...getStageAttempts(runId, "timestamps"), ...getStageAttempts(runId, "decomposition")].every((attempt) => attempt.cycle < 2 || attempt.outcome !== "in-flight" && attempt.outcome !== "scheduled"),
    );
    expect(voiceStub.calls).toHaveLength(0);
    expect(voiceFingerprint(runId)).toEqual(before);
    if (!succeeds) expect(stateOf(runId)).toBe("failed");
  });
});
