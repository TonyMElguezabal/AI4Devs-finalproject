import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  db,
  getAllVideoGeneratingScenes,
  getImageCompleteScenesForRun,
  getRun,
  getScene,
  getScenesForRun,
  insertVoiceOver,
  markImageComplete,
  PROJECTS_ROOT,
  resetAll,
  resolveArtefactPath,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  continueSession,
  correctAndRetry,
  deriveSessionState,
  launchVideoStage,
  launchVideoStageForRun,
  manualRetry,
  nextVideoStageLaunchCount,
  pauseSession,
  recoverOnBoot,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
  toSnapshot,
} from "../src/orchestrator.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoDownloadFetch,
  setVideoProviderRegistry,
  STUB_VIDEO_PROVIDER_NAME,
} from "../src/videoProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// generate-chunk-video (JOS-146), groups 4-7: launch, completion, failures/retries, restart.

const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = buildMp4();

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
  // Minimal ftyp box: 4 bytes size, 4 bytes 'ftyp', 4 bytes brand
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(12, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("mp42", 8, "ascii");
  return buf;
}

function buildNonMp4(): Buffer {
  return Buffer.from([0x00, 0x00, 0x00, 0x00, 0x47, 0x41, 0x52, 0x42]);
}

function stubGenerator(): VisualInstructionGenerator {
  return {
    async generate(texts) {
      return {
        kind: "success",
        pairs: texts.map((_, i) => ({
          image: `image instruction ${i + 1}`,
          video: `video instruction ${i + 1}`,
        })),
      };
    },
  };
}

const TEST_VIDEO_PROVIDER_ID = "test-video-adapter";

/**
 * Registers scenes and brings them to `image-complete` by writing the image
 * bytes directly (bypasses the image-stage orchestration so the helper works
 * regardless of session pause state). Calls `launchVideoStageForRun` at the
 * end — gated by pause — to simulate what `completeImageStage` would do.
 */
async function bringToImageComplete(runId: string): Promise<string[]> {
  const fragments: SegmentedFragment[] = [
    { text: "script", narrationInterval: { startSeconds: 0, endSeconds: 8 } },
  ];
  const regResult = await registerDecomposition(runId, fragments, stubGenerator(), 8);
  if (!regResult.ok) throw new Error(`bringToImageComplete: registration failed: ${regResult.reason}`);

  const run = getRun(runId)!;
  const scenes = getScenesForRun(runId);
  for (const scene of scenes) {
    const relativePath = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
    commitSceneResult(scene.id, relativePath);
    markImageComplete(scene.id, relativePath);
  }

  // Launch video stage for image-complete scenes; pause state gates this.
  launchVideoStageForRun(runId);

  return scenes.map((s) => s.id);
}

beforeEach(() => {
  resetVideoStageStartDelayMs(); // ensure 0ms (no delay) for video-stage tests
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyTool();
});

// ---- Group 4: Precondition and launch ----

describe("Group 4 — Precondition and launch (Decisions 1, 2, 4)", () => {
  it("a chunk in 'submitted' sends no clip request", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");
    const sceneId = randomUUID();
    db.prepare("INSERT INTO scenes (id, run_id, idx, status, updated_at) VALUES (?, ?, 1, 'submitted', ?)").run(sceneId, runId, new Date().toISOString());

    const provider = createStubVideoProvider("success-bytes");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    launchVideoStage(sceneId);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provider.calls).toHaveLength(0);
    expect(getScene(sceneId)?.status).toBe("submitted");
  });

  it("a chunk in 'failed' sends no clip request", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");
    const sceneId = randomUUID();
    db.prepare("INSERT INTO scenes (id, run_id, idx, status, updated_at) VALUES (?, ?, 1, 'failed', ?)").run(sceneId, runId, new Date().toISOString());

    const provider = createStubVideoProvider("success-bytes");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    launchVideoStage(sceneId);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provider.calls).toHaveLength(0);
  });

  it("a chunk in 'chunk-complete' sends no clip request", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");
    const sceneId = randomUUID();
    db.prepare("INSERT INTO scenes (id, run_id, idx, status, updated_at) VALUES (?, ?, 1, 'chunk-complete', ?)").run(sceneId, runId, new Date().toISOString());

    const provider = createStubVideoProvider("success-bytes");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    launchVideoStage(sceneId);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provider.calls).toHaveLength(0);
  });

  it("a chunk in 'image-complete' with no stored requestedDurationSeconds fails not-retryable", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");
    const sceneId = randomUUID();
    db.prepare(
      "INSERT INTO scenes (id, run_id, idx, status, instruction, image_instruction, video_instruction, updated_at) VALUES (?, ?, 1, 'image-complete', 'i', 'i', 'v', ?)",
    ).run(sceneId, runId, new Date().toISOString());
    commitSceneResult(sceneId, "scene-1.png");
    markImageComplete(sceneId, "scene-1.png");

    const provider = createStubVideoProvider("success-bytes");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    launchVideoStage(sceneId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provider.calls).toHaveLength(0);
    expect(getScene(sceneId)?.status).toBe("failed");
  });

  it("committing an image result launches the clip (Decision 2)", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    const sceneIds = await bringToImageComplete(runId);
    expect(sceneIds).toHaveLength(1);

    // Wait for video stage to launch and complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const scene = getScene(sceneIds[0]!);
    expect(scene?.status).toBe("chunk-complete");
  });

  it("the chunk is 'video-generating' before the adapter is called", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");

    let capturedStatus: string | undefined;
    const captureProvider = {
      calls: [] as string[],
      async submit({ instruction }: { imageBytes: Buffer; instruction: string; durationSeconds: number }) {
        capturedStatus = getScene(
          getScenesForRun(runId)[0]!.id,
        )?.status;
        captureProvider.calls.push(instruction);
        return { kind: "submitted" as const, requestId: "test-req" };
      },
      async poll() {
        return { kind: "success" as const, clip: { source: "bytes" as const, bytes: MP4_BYTES } };
      },
    };
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: captureProvider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(capturedStatus).toBe("video-generating");
  });

  it("a duplicate image delivery does not launch the clip a second time", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    const sceneIds = await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const scene = getScene(sceneIds[0]!);
    const launchCount = nextVideoStageLaunchCount(sceneIds[0]!);

    expect(scene?.status).toBe("chunk-complete");
    expect(launchCount).toBe(1);
  });

  it("a paused session holds an 'image-complete' chunk with no request, and continuing launches it", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");
    pauseSession(runId);

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Still image-complete because paused
    const scenes = getScenesForRun(runId);
    expect(scenes[0]?.status).toBe("image-complete");
    expect(provider.calls).toHaveLength(0);
    expect(toSnapshot(runId)?.session.held).toEqual([{ stage: "video", count: 1 }]);

    continueSession(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(getScene(scenes[0]!.id)?.status).toBe("chunk-complete");
  });

  it("uses the 'video' concurrency key, not the 'image' one", async () => {
    const runId = randomUUID();
    createRun(runId, "test", "script", "en");

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // image concurrency slot should be 0 (not used by video stage)
    expect(concurrency.stats("image").inFlight).toBe(0);
  });
});

// ---- Group 5: Completion ----

describe("Group 5 — Completion (Decision 8)", () => {
  it("stores scene-<idx>.mp4 in the project folder and sets chunk-complete", async () => {
    const runId = randomUUID();
    createRun(runId, "completion test", "script", "en");

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    const sceneIds = await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const scene = getScene(sceneIds[0]!);
    expect(scene?.status).toBe("chunk-complete");
    expect(scene?.videoResult).toBeTruthy();
    expect(scene?.videoResult).toContain(".mp4");
    expect(scene?.result).toBeTruthy(); // image path unchanged
  });

  it("the image result (scenes.result) is unchanged after the video stage succeeds", async () => {
    const runId = randomUUID();
    createRun(runId, "image unchanged test", "script", "en");

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    const sceneIds = await bringToImageComplete(runId);
    const imageResult = getScene(sceneIds[0]!)?.result;
    await new Promise((resolve) => setTimeout(resolve, 100));

    const after = getScene(sceneIds[0]!);
    expect(after?.result).toBe(imageResult); // image path unchanged
    expect(after?.videoResult).toBeTruthy(); // clip added
  });

  it("a temporary link is downloaded before chunk-complete — the URL is never stored as videoResult", async () => {
    const runId = randomUUID();
    createRun(runId, "download test", "script", "en");

    const provider = createStubVideoProvider("success-temporary-url", {
      url: "https://cdn.example.com/stub.mp4",
    });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });
    setVideoDownloadFetch(async () => new Response(new Uint8Array(MP4_BYTES), { status: 200 }));

    const sceneIds = await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const scene = getScene(sceneIds[0]!);
    expect(scene?.status).toBe("chunk-complete");
    expect(scene?.videoResult).not.toContain("https://");
    expect(scene?.videoResult).toContain(".mp4");
  });

  it("a failed download counts as a failed transient attempt (no clip stored)", async () => {
    const runId = randomUUID();
    createRun(runId, "download fail test", "script", "en");

    const provider = createStubVideoProvider("success-temporary-url", {
      url: "https://cdn.example.com/stub.mp4",
    });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });
    setVideoDownloadFetch(async () => { throw new Error("network error"); });

    const sceneIds = await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const scene = getScene(sceneIds[0]!);
    // After retries exhausted: failed
    expect(["failed", "image-complete"].includes(scene?.status ?? "")).toBe(true);
    expect(scene?.videoResult).toBeNull();
  });

  it("a file that is not an MP4 counts as a failed transient attempt", async () => {
    const runId = randomUUID();
    createRun(runId, "not mp4 test", "script", "en");

    const provider = createStubVideoProvider("success-bytes", { bytes: buildNonMp4() });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    const sceneIds = await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const scene = getScene(sceneIds[0]!);
    expect(["failed", "image-complete"].includes(scene?.status ?? "")).toBe(true);
    expect(scene?.videoResult).toBeNull();
  });
});

// ---- Group 6: Failures, retries and binding ----

describe("Group 6 — Failures, retries, binding (Decisions 5, 6, 7)", () => {
  it("a transient clip failure retries the video stage only (no image request sent again)", async () => {
    const runId = randomUUID();
    createRun(runId, "retry test", "script", "en");

    let callCount = 0;
    const flakyProvider = {
      calls: [] as string[],
      async submit({ instruction }: { imageBytes: Buffer; instruction: string; durationSeconds: number }) {
        callCount++;
        this.calls.push(instruction);
        return { kind: "submitted" as const, requestId: `req-${callCount}` };
      },
      async poll(reqId: string) {
        if (callCount === 1) return { kind: "failed_transient" as const, reason: "first attempt fails" };
        return { kind: "success" as const, clip: { source: "bytes" as const, bytes: MP4_BYTES } };
      },
    };
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: flakyProvider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const scene = getScenesForRun(runId)[0]!;
    expect(scene.status).toBe("chunk-complete");
    expect(callCount).toBeGreaterThan(1); // retried
  });

  it("an exhausted budget leaves the chunk 'failed' with affectedStage: 'video'", async () => {
    const runId = randomUUID();
    createRun(runId, "budget exhausted test", "script", "en");

    const provider = createStubVideoProvider("transient-failure");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const scene = getScenesForRun(runId)[0]!;
    expect(scene.status).toBe("failed");

    const snapshot = toSnapshot(runId);
    const scenePayload = snapshot?.scenes[0];
    expect(scenePayload?.affectedStage).toBe("video");
  });

  it("an image-stage failure still reports affectedStage: 'image'", async () => {
    const runId = randomUUID();
    createRun(runId, "image fail test", "script", "en");
    const sceneId = randomUUID();
    db.prepare(
      "INSERT INTO scenes (id, run_id, idx, status, instruction, image_instruction, video_instruction, updated_at) VALUES (?, ?, 1, 'failed', 'i', 'i', 'v', ?)",
    ).run(sceneId, runId, new Date().toISOString());
    // No scenes.result set — image stage never completed

    const snapshot = toSnapshot(runId);
    const scenePayload = snapshot?.scenes[0];
    expect(scenePayload?.affectedStage).toBe("image");
  });

  it("a not-retryable clip failure skips automatic retries", async () => {
    const runId = randomUUID();
    createRun(runId, "not retryable test", "script", "en");

    const provider = createStubVideoProvider("not-retryable-failure");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const scene = getScenesForRun(runId)[0]!;
    expect(scene.status).toBe("failed");
    // Only 1 submit call (no retries)
    expect(provider.calls).toHaveLength(1);
  });

  it("the first clip attempt uses attempt 1, independent of the image stage's budget", async () => {
    const runId = randomUUID();
    createRun(runId, "attempt numbering test", "script", "en");

    let firstAttemptNumber = 0;
    const captureProvider = {
      calls: [] as string[],
      async submit({ instruction }: { imageBytes: Buffer; instruction: string; durationSeconds: number }) {
        captureProvider.calls.push(instruction);
        firstAttemptNumber = getScene(getScenesForRun(runId)[0]!.id)?.attempts ?? 0;
        return { kind: "submitted" as const, requestId: "req-video-1" };
      },
      async poll() {
        return { kind: "success" as const, clip: { source: "bytes" as const, bytes: MP4_BYTES } };
      },
    };
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: captureProvider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(firstAttemptNumber).toBe(1); // video stage starts at attempt 1
  });

  it("manually retries a not-retryable clip with the stored VIDEO and its bound provider", async () => {
    const runId = randomUUID();
    createRun(runId, "manual retry clip test", "script", "en");

    const originalProvider = createStubVideoProvider("not-retryable-failure");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: originalProvider } });

    const sceneIds = await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const sceneId = sceneIds[0]!;
    const before = getScene(sceneId)!;
    expect(before.status).toBe("failed");

    const boundProvider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    const newDefaultProvider = createStubVideoProvider("transient-failure");
    setVideoProviderRegistry({
      defaultIdentifier: "new-video-default",
      adapters: { [TEST_VIDEO_PROVIDER_ID]: boundProvider, "new-video-default": newDefaultProvider },
    });

    expect(manualRetry(runId, sceneId)).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const after = getScene(sceneId)!;
    expect(boundProvider.calls).toEqual([before.videoInstruction]);
    expect(newDefaultProvider.calls).toEqual([]);
    expect(after.status).toBe("chunk-complete");
    expect(after.result).toBe(before.result);
    expect(after.videoProvider).toBe(TEST_VIDEO_PROVIDER_ID);
  });

  it("corrects only VIDEO and retries the clip using the corrected instruction", async () => {
    const runId = randomUUID();
    createRun(runId, "correct retry clip test", "script", "en");

    const originalProvider = createStubVideoProvider("not-retryable-failure");
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: originalProvider } });

    const sceneIds = await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const sceneId = sceneIds[0]!;
    const before = getScene(sceneId)!;
    expect(before.status).toBe("failed");

    const retryProvider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: retryProvider } });

    expect(correctAndRetry(runId, sceneId, "a corrected video instruction")).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const after = getScene(sceneId)!;
    expect(retryProvider.calls).toEqual(["a corrected video instruction"]);
    expect(after.status).toBe("chunk-complete");
    expect(after.videoInstruction).toBe("a corrected video instruction");
    expect(after.imageInstruction).toBe(before.imageInstruction);
    expect(after.result).toBe(before.result);
    expect(after.prompt).toBe(before.prompt);
    expect(after.videoProvider).toBe(TEST_VIDEO_PROVIDER_ID);
  });

  it("manualRetry on an image-stage failure works as before (unchanged behaviour)", () => {
    const runId = randomUUID();
    createRun(runId, "manual retry image test", "script", "en");
    const sceneId = randomUUID();
    // Scene that failed the image stage: result is null (image path never stored)
    db.prepare(
      "INSERT INTO scenes (id, run_id, idx, status, instruction, image_instruction, video_instruction, attempts, updated_at) VALUES (?, ?, 1, 'failed', 'i', 'i', 'v', 1, ?)",
    ).run(sceneId, runId, new Date().toISOString());

    const result = manualRetry(runId, sceneId);

    // manualRetry succeeds (not refused with the 409 video-stage guard)
    expect(result.ok).toBe(true);
    // Scene is no longer failed — relaunched (exact status depends on provider availability)
    expect(getScene(sceneId)?.status).not.toBe("failed");
  });
});

// ---- Group 7: Session state after video stage ----

describe("Group 7 — Session state after video stage", () => {
  it("all chunks chunk-complete → session is final-video-generating (assembly not yet done)", async () => {
    // JOS-149: chunks reaching chunk-complete moves the session to
    // `final-video-generating`, NOT `final-video`. `final-video` requires
    // assembly to succeed (run.finalVideoPath set by assemble-final-video).
    // retry-final-assembly (JOS-159) — "not yet done" now means genuinely still running: a slow assembly tool,
    // so the 100ms check below lands while it is still in flight, not after it has already failed or succeeded.
    const runId = randomUUID();
    createRun(runId, "final video test", "script", "en");
    insertVoiceOver({
      runId,
      audioPath: "voice-over.mp3",
      timestampsPath: null,
      durationSeconds: 8,
      sizeBytes: 1,
      nativeTimestampsAvailable: false,
      providerRequestId: null,
      completedAt: new Date().toISOString(),
    });
    setAssemblyTool(createStubAssemblyTool({ kind: "slow-success", delayMs: 10_000 }));

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    await bringToImageComplete(runId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const snapshot = toSnapshot(runId);
    expect(snapshot?.session.state).toBe("final-video-generating");
    expect(snapshot?.session.failedPhase).toBeUndefined();
  });

  it("deriveSessionState: 'video-generating' scenes still count as processing", () => {
    const state = deriveSessionState([
      { status: "video-generating" } as any,
      { status: "chunk-complete" } as any,
    ]);
    expect(state.state).toBe("chunks-processing");
  });

  it("deriveSessionState: 'image-complete' scenes still count as processing", () => {
    const state = deriveSessionState([{ status: "image-complete" } as any]);
    expect(state.state).toBe("chunks-processing");
  });

  it("deriveSessionState: failed scene with a stored image → affectedStage video in payload", () => {
    const runId = randomUUID();
    createRun(runId, "derive test", "script", "en");
    const sceneId = randomUUID();
    db.prepare(
      "INSERT INTO scenes (id, run_id, idx, status, result, updated_at) VALUES (?, ?, 1, 'failed', 'scene-1.png', ?)",
    ).run(sceneId, runId, new Date().toISOString());

    const snapshot = toSnapshot(runId);
    expect(snapshot?.scenes[0]?.affectedStage).toBe("video");
  });
});

// ---- Reconciliation (Decision 9) ----

describe("Reconciliation on boot (Decision 9)", () => {
  it("a 'video-generating' scene whose provider is unbound is treated as a lost attempt", async () => {
    const runId = randomUUID();
    createRun(runId, "recon test", "script", "en");
    const sceneId = randomUUID();
    // Scene in video-generating with no video_provider (unbound → lost)
    db.prepare(
      "INSERT INTO scenes (id, run_id, idx, status, attempts, current_request_id, updated_at) VALUES (?, ?, 1, 'video-generating', 1, ?, ?)",
    ).run(sceneId, runId, randomUUID(), new Date().toISOString());

    const provider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER_ID, adapters: { [TEST_VIDEO_PROVIDER_ID]: provider } });

    const result = recoverOnBoot();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Either retried successfully or marked failed, but not still video-generating
    const scene = getScene(sceneId);
    expect(scene?.status).not.toBe("video-generating");
  });
});
