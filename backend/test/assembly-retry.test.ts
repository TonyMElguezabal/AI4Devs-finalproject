import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  getRun,
  getScenesForRun,
  getStageAttempts,
  insertVoiceOver,
  markImageComplete,
  resetAll,
  setFinalVideoPath,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  RETRY_BUDGET,
  assemblyStageLauncher,
  continueSession,
  launchVideoStageForRun,
  pauseSession,
  resetAssemblyLaunchCount,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
  toSnapshot,
} from "../src/orchestrator.ts";
import { retryAssembly } from "../src/assemblyRetry.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// retry-final-assembly (JOS-159), group 4 — `retryAssembly`, the launcher's held-retry accounting, and the
// session state a retry derives while pending, held or running.

const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = buildMp4();
const FAKE_VOICE_OVER_BYTES = Buffer.from("fake-mp3-bytes");
const TEST_VIDEO_PROVIDER = "test-video-provider";

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
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })) };
    },
  };
}

function makeFragments(count: number): SegmentedFragment[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Scene ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
}

function makeScript(count: number): string {
  return Array.from({ length: count }, (_, i) => `Scene ${i + 1}.`).join(" ");
}

async function bringToChunkComplete(runId: string, sceneCount: number): Promise<void> {
  const fragments = makeFragments(sceneCount);
  const regResult = await registerDecomposition(runId, fragments, stubGenerator(), sceneCount * 5);
  if (!regResult.ok) throw new Error(`registration failed: ${regResult.reason}`);

  const run = getRun(runId)!;
  for (const scene of getScenesForRun(runId)) {
    const rel = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
    commitSceneResult(scene.id, rel);
    markImageComplete(scene.id, rel);
  }
  launchVideoStageForRun(runId);

  await waitFor(() => getScenesForRun(runId).every((s) => s.status === "chunk-complete" || s.status === "failed"), 3000);
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

async function waitFor(predicate: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A chunk-complete, voice-over-stored session whose only assembly attempt has already failed. */
async function failedSession(tool: ReturnType<typeof createStubAssemblyTool>): Promise<{ runId: string }> {
  const runId = randomUUID();
  createRun(runId, "Assembly retry test", makeScript(2), "en");
  addFakeVoiceOver(runId, 2);
  setAssemblyTool(tool);
  await bringToChunkComplete(runId, 2);
  await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);
  return { runId };
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
    adapters: { [TEST_VIDEO_PROVIDER]: createStubVideoProvider("success-bytes", { bytes: MP4_BYTES }) },
  });
});

describe("retryAssembly refusals (JOS-159, design Decision 3)", () => {
  it("refuses an unknown session", () => {
    expect(retryAssembly(randomUUID())).toEqual({ ok: false, reason: "session-not-found" });
  });

  it("refuses a session that has not failed in assembly, with the tool never called", async () => {
    const runId = randomUUID();
    createRun(runId, "Not failed", makeScript(1), "en");
    let called = false;
    setAssemblyTool({
      async assemble(input) {
        called = true;
        return createStubAssemblyTool({ kind: "success" }).assemble(input);
      },
    });

    expect(retryAssembly(runId)).toEqual({ ok: false, reason: "not-failed-in-assembly" });
    expect(called).toBe(false);
  });

  it("refuses a session whose final video is already generated, with the tool never called (a defensive guard — design Decision 3)", async () => {
    // A real failure always clears on success, so `not-failed-in-assembly` would otherwise catch this first;
    // this reconstructs the inconsistent state (failure still recorded, final video already present) directly
    // to exercise the guard's own defence.
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "not-retryable-failure" }));
    setFinalVideoPath(runId, "final-video.mp4");
    let called = false;
    setAssemblyTool({
      async assemble(input) {
        called = true;
        return createStubAssemblyTool({ kind: "success" }).assemble(input);
      },
    });

    expect(retryAssembly(runId)).toEqual({ ok: false, reason: "final-video-already-generated" });
    expect(called).toBe(false);
  });

  it("opens exactly one cycle when called concurrently, with the tool called exactly once", async () => {
    let calls = 0;
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "not-retryable-failure" }));
    setAssemblyTool({
      async assemble(input) {
        calls++;
        return createStubAssemblyTool({ kind: "success" }).assemble(input);
      },
    });

    const results = [retryAssembly(runId), retryAssembly(runId)];

    // design Decision 3's "found during implementation" note — no separate `retry-already-pending`: the whole
    // function has no `await`, so the loser's own re-check lands on `not-failed-in-assembly`, the same reason as
    // any other "nothing to retry right now" call.
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "not-failed-in-assembly")).toHaveLength(1);
    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);
    expect(calls).toBe(1);
  });

  it("accepts a retry after a retryable (budget-exhausted) failure", async () => {
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "transient-failure", reason: "stub transient" }));
    expect(getRun(runId)!.failure).toMatchObject({ retryable: true });
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    expect(retryAssembly(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);
  });

  it("accepts a retry after a not-retryable failure", async () => {
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "not-retryable-failure" }));
    expect(getRun(runId)!.failure).toMatchObject({ retryable: false });
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    expect(retryAssembly(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);
  });
});

describe("A retry's held accounting (JOS-159, design Decision 4)", () => {
  it("is held while the session is paused, and runs exactly once on continue", async () => {
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "not-retryable-failure" }));
    pauseSession(runId);
    let calls = 0;
    setAssemblyTool({
      async assemble(input) {
        calls++;
        return createStubAssemblyTool({ kind: "success" }).assemble(input);
      },
    });

    const result = retryAssembly(runId);

    expect(result).toEqual({ ok: true, held: true });
    expect(assemblyStageLauncher.heldWork(runId).count).toBe(1);
    expect(calls).toBe(0);

    continueSession(runId);

    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);
    expect(calls).toBe(1);
  });
});

describe("A new cycle allows a full retry budget (JOS-159, design Decision 3)", () => {
  it("gives a retried attempt its own 1 + RETRY_BUDGET attempts", async () => {
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "transient-failure", reason: "stub transient" }));
    expect(getStageAttempts(runId, "assembly").length).toBe(1 + RETRY_BUDGET);
    setAssemblyTool(createStubAssemblyTool({ kind: "transient-failure", reason: "stub transient again" }));

    expect(retryAssembly(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => getStageAttempts(runId, "assembly").length === 2 * (1 + RETRY_BUDGET), 5000);
    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: true });
  });
});

describe("Derived state around a retry (JOS-159, design Decision 1/task 4.3)", () => {
  it("derives final-video-generating, assembly in-progress and no failure, while the retry is held, scheduled or running", async () => {
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "not-retryable-failure" }));
    pauseSession(runId);
    setAssemblyTool(createStubAssemblyTool({ kind: "slow-success", delayMs: 50 }));

    retryAssembly(runId);
    let snapshot = toSnapshot(runId)!;
    expect(snapshot.session.state).toBe("final-video-generating");
    expect(snapshot.session.failure).toBeUndefined();
    expect(snapshot.session.phases[3]).toMatchObject({ phase: "assembly", status: "in-progress" });

    continueSession(runId);
    snapshot = toSnapshot(runId)!;
    expect(snapshot.session.state).toBe("final-video-generating");
    expect(snapshot.session.phases[3]).toMatchObject({ phase: "assembly", status: "in-progress" });

    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);
    expect(toSnapshot(runId)!.session.state).toBe("final-video");
  });

  it("derives failed with the retry's own new cause when it fails again", async () => {
    const { runId } = await failedSession(createStubAssemblyTool({ kind: "not-retryable-failure", reason: "first failure" }));
    setAssemblyTool(createStubAssemblyTool({ kind: "not-retryable-failure", reason: "second failure" }));

    retryAssembly(runId);

    await waitFor(() => getRun(runId)?.failure?.cause.includes("second failure") ?? false, 5000);
    expect(toSnapshot(runId)!.session.state).toBe("failed");
    expect(toSnapshot(runId)!.session.failedPhase).toBe("assembly");
  });
});
