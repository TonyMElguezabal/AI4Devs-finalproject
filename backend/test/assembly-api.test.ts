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
  resetAssemblyLaunchCount,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
  toSnapshot,
} from "../src/orchestrator.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
} from "../src/videoProvider.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// assemble-final-video (JOS-149), group 6 — the API session representation:
// finalVideo field, download route, no MP3 leak.

const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = buildMp4();
const FAKE_VOICE_OVER_BYTES = Buffer.from("fake-mp3-bytes");

function buildPng(w: number, h: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
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

function makeScript(count: number): string {
  return Array.from({ length: count }, (_, i) => `Scene ${i + 1}.`).join(" ");
}

function makeFragments(count: number): SegmentedFragment[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Scene ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
}

function addFakeVoiceOver(runId: string, sceneCount: number): void {
  const run = getRun(runId)!;
  const rel = writeArtefactOnce(run.projectFolder, "voice-over.mp3", FAKE_VOICE_OVER_BYTES);
  insertVoiceOver({
    runId,
    audioPath: rel,
    timestampsPath: null,
    durationSeconds: sceneCount * 5,
    sizeBytes: FAKE_VOICE_OVER_BYTES.length,
    nativeTimestampsAvailable: false,
    providerRequestId: "fake-request",
    completedAt: new Date().toISOString(),
  });
}

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

// ---- Task 6.1 — session representation includes finalVideo once complete ----

describe("Task 6.1 — session representation includes finalVideo after assembly", () => {
  it("snapshot has finalVideoUrl in session payload when state is final-video", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => getRun(runId)?.finalVideoPath != null);

    const snapshot = toSnapshot(runId)!;
    expect(snapshot.session.state).toBe("final-video");
    expect((snapshot.session as any).finalVideoUrl).toBe(`/sessions/${runId}/download/final-video`);
  });

  it("snapshot has no finalVideoUrl before assembly succeeds", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");

    const snapshot = toSnapshot(runId)!;
    expect((snapshot.session as any).finalVideoUrl).toBeUndefined();
  });
});

// ---- Task 6.2 — failed assembly state exposed correctly ----

describe("Task 6.2 — failed assembly is reflected in session snapshot", () => {
  it("assembly stage attempt with not-retryable outcome exists after not-retryable failure", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);
    setAssemblyTool(createStubAssemblyTool({ kind: "not-retryable-failure", reason: "irreversible error" }));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => {
      const attempts = getStageAttempts(runId, "assembly");
      return attempts.some((a) => a.outcome === "not-retryable");
    });

    const attempts = getStageAttempts(runId, "assembly");
    const failed = attempts.find((a) => a.outcome === "not-retryable");
    expect(failed).toBeDefined();
    expect(failed!.errorMessage).toBe("irreversible error");
    expect(failed!.providerId).toBeNull();
  });
});

// ---- Task 6.3 — no route leaks the MP3, timestamps, or generated texts ----

describe("Task 6.3 — voice-over path is not exposed in the session snapshot", () => {
  it("session snapshot does not include the voice-over audio path", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", makeScript(1), "en");
    addFakeVoiceOver(runId, 1);

    const snapshot = toSnapshot(runId)!;
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("voice-over.mp3");
  });
});
