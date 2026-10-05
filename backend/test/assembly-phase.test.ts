import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  getStageAttempts,
  getRun,
  getScenesForRun,
  insertVoiceOver,
  markImageComplete,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  launchVideoStageForRun,
  nextAssemblyLaunchCount,
  resetAssemblyLaunchCount,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
} from "../src/orchestrator.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
} from "../src/videoProvider.ts";
import {
  createCapturingAssemblyTool,
  createStubAssemblyTool,
  type CapturedAssemblyInput,
} from "../src/stubAssemblyTool.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// assemble-final-video (JOS-149), group 5 — the full assembly phase:
// ordering, interval trust, audio replacement, format, persistence, retry
// isolation, and retry reuse.

const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = buildMp4();
const FAKE_VOICE_OVER_BYTES = Buffer.from("fake-mp3-bytes");

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function buildMp4(): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(12, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("mp42", 8, "ascii");
  return buf;
}

function stubGenerator(): VisualInstructionGenerator {
  return {
    async generate(texts) {
      return {
        kind: "success",
        pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })),
      };
    },
  };
}

const TEST_VIDEO_PROVIDER = "test-video-provider";

/** Builds N fragment texts that join to match the script passed to createRun. */
function makeFragments(count: number): SegmentedFragment[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Scene ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
}

/** Returns the script string for N scenes that matches makeFragments. */
function makeScript(count: number): string {
  return Array.from({ length: count }, (_, i) => `Scene ${i + 1}.`).join(" ");
}

/**
 * Brings a session with N scenes through image-complete and video-complete
 * (chunk-complete), then waits for all scenes to reach chunk-complete.
 */
async function bringToChunkComplete(runId: string, sceneCount: number): Promise<void> {
  const fragments = makeFragments(sceneCount);
  const regResult = await registerDecomposition(runId, fragments, stubGenerator(), sceneCount * 5);
  if (!regResult.ok) throw new Error(`registration failed: ${regResult.reason}`);

  const run = getRun(runId)!;
  const scenes = getScenesForRun(runId);
  for (const scene of scenes) {
    const rel = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
    commitSceneResult(scene.id, rel);
    markImageComplete(scene.id, rel);
  }
  launchVideoStageForRun(runId);

  await waitFor(() => getScenesForRun(runId).every((s) => s.status === "chunk-complete" || s.status === "failed"), 3000);
}

/** Stores a fake voice-over so the assembly phase can find one. */
function addFakeVoiceOver(runId: string, sceneCount: number): void {
  const run = getRun(runId)!;
  const rel = writeArtefactOnce(run.projectFolder, "voice-over.mp3", FAKE_VOICE_OVER_BYTES);
  const now = new Date().toISOString();
  insertVoiceOver({
    runId,
    audioPath: rel,
    timestampsPath: null,
    durationSeconds: sceneCount * 5,
    sizeBytes: FAKE_VOICE_OVER_BYTES.length,
    nativeTimestampsAvailable: false,
    providerRequestId: "fake-request",
    completedAt: now,
  });
}

async function waitFor(predicate: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyLaunchCount();
  resetAssemblyTool();
  setVideoProviderRegistry({
    defaultIdentifier: TEST_VIDEO_PROVIDER,
    adapters: {
      [TEST_VIDEO_PROVIDER]: createStubVideoProvider("success-bytes", { bytes: MP4_BYTES }),
    },
  });
});

// ---- Task 5.1 — clips are ordered by ascending sequence_number ----

describe("Task 5.1 — assembly input clips are ordered by ascending sequence_number", () => {
  it("passes clips to the assembly tool in ascending index order", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(3), "en");
    addFakeVoiceOver(runId, 3);
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    await bringToChunkComplete(runId, 3);
    await waitFor(() => captured.length > 0);

    const indexes = captured[0]!.clips.map((c) => c.narrationStartSeconds);
    expect(indexes).toEqual([0, 5, 10]);
  });
});

// ---- Task 5.2 — intervals come from persisted data, never re-measured ----

describe("Task 5.2 — clip intervals come from persisted narration intervals, not from clip measurement", () => {
  it("passes narrationStartSeconds and narrationDurationSeconds from scene intervals", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(2), "en");
    addFakeVoiceOver(runId, 2);
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    await bringToChunkComplete(runId, 2);
    await waitFor(() => captured.length > 0);

    const [clip0, clip1] = captured[0]!.clips;
    expect(clip0!.narrationStartSeconds).toBe(0);
    expect(clip0!.narrationDurationSeconds).toBe(5);
    expect(clip1!.narrationStartSeconds).toBe(5);
    expect(clip1!.narrationDurationSeconds).toBe(5);
  });
});

// ---- Task 5.3 — the output's only audio is the voice-over ----

describe("Task 5.3 — the voice-over path is passed to the assembly tool", () => {
  it("passes the voice-over's absolute path in the assembly input", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => captured.length > 0);

    expect(captured[0]!.voiceOverPath).toContain("voice-over.mp3");
  });
});

// ---- Task 5.4 — hardcoded output format constants are used ----

describe("Task 5.4 — assembly input uses the hardcoded output format constants", () => {
  it("uses fps=30, width=1920, height=1080 for every assembly call", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => captured.length > 0);

    expect(captured[0]!.fps).toBe(30);
    expect(captured[0]!.width).toBe(1920);
    expect(captured[0]!.height).toBe(1080);
  });
});

// ---- Task 5.5 — all scenes included, no omission ----

describe("Task 5.5 — all scenes included in assembly input", () => {
  it("passes all N clips for an N-scene session", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(4), "en");
    addFakeVoiceOver(runId, 4);
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    await bringToChunkComplete(runId, 4);
    await waitFor(() => captured.length > 0);

    expect(captured[0]!.clips).toHaveLength(4);
  });
});

// ---- Task 5.6 — successful assembly persists the path and sets session state ----

describe("Task 5.6 — successful assembly persists final_video_path", () => {
  it("sets Session.final_video_path after a successful assembly", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => getRun(runId)?.finalVideoPath != null);

    expect(getRun(runId)!.finalVideoPath).not.toBeNull();
  });

  it("records a completed assembly stage attempt after success", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => {
      const attempts = getStageAttempts(runId, "assembly");
      return attempts.some((a) => a.outcome === "success");
    });

    const attempts = getStageAttempts(runId, "assembly");
    const done = attempts.find((a) => a.outcome === "success");
    expect(done).toBeDefined();
    expect(done!.providerId).toBeNull();
  });
});

// ---- Task 5.7 — failed assembly does not touch voice or chunk records ----

describe("Task 5.7 — failed assembly is isolated: no writes to voice or chunk records", () => {
  it("does not change any scene status after a not-retryable assembly failure", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    setAssemblyTool(createStubAssemblyTool({ kind: "not-retryable-failure" }));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => {
      const attempts = getStageAttempts(runId, "assembly");
      return attempts.some((a) => a.outcome === "not-retryable");
    });

    const scenes = getScenesForRun(runId);
    expect(scenes.every((s) => s.status === "chunk-complete")).toBe(true);
    expect(getRun(runId)!.finalVideoPath).toBeNull();
  });

  it("final_video_path is set only after eventual success, not after a transient failure", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);

    let callCount = 0;
    const tool = {
      async assemble(input: import("../src/assemblyTool.ts").AssemblyInput) {
        callCount++;
        if (callCount === 1) return { kind: "failed_transient" as const, reason: "first attempt fails" };
        return { kind: "success" as const, outputPath: input.outputPath };
      },
    };
    setAssemblyTool(tool);

    await bringToChunkComplete(runId, 1);
    await waitFor(() => getRun(runId)?.finalVideoPath != null, 3000);

    expect(getRun(runId)!.finalVideoPath).not.toBeNull();
    expect(callCount).toBe(2);
  });
});

// ---- Task 5.8 — a retried assembly reuses the same clips, no regeneration ----

describe("Task 5.8 — retried assembly reuses voice-over and clips without regeneration", () => {
  it("passes the same clip paths in every retry attempt", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    const captured: CapturedAssemblyInput[] = [];

    let callCount = 0;
    const tool = {
      async assemble(input: import("../src/assemblyTool.ts").AssemblyInput) {
        callCount++;
        captured.push({ ...input, clips: [...input.clips] });
        if (callCount === 1) return { kind: "failed_transient" as const, reason: "first attempt" };
        return { kind: "success" as const, outputPath: input.outputPath };
      },
    };
    setAssemblyTool(tool);

    await bringToChunkComplete(runId, 1);
    await waitFor(() => callCount >= 2, 3000);

    expect(captured[0]!.clips.map((c) => c.clipPath)).toEqual(captured[1]!.clips.map((c) => c.clipPath));
    expect(captured[0]!.voiceOverPath).toBe(captured[1]!.voiceOverPath);
  });
});
