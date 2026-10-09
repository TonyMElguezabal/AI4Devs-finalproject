import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  clearRunFailure,
  commitSceneResult,
  createRun,
  getRun,
  getScenesForRun,
  getStageAttempts,
  getVoiceOver,
  insertVoiceOver,
  isReadableMp4,
  markImageComplete,
  moveAssemblyOutput,
  resetAll,
  resolveArtefactPath,
  writeArtefactOnce,
} from "../src/db.ts";
import { launchHeldWork } from "../src/launchGate.ts";
import {
  RETRY_BUDGET,
  deriveSessionState,
  launchVideoStageForRun,
  nextAssemblyLaunchCount,
  resetAssemblyLaunchCount,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
  toSnapshot,
} from "../src/orchestrator.ts";
import { retryAssembly } from "../src/assemblyRetry.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
} from "../src/videoProvider.ts";
import { createCapturingAssemblyTool, createStubAssemblyTool, type CapturedAssemblyInput, type StubAssemblyMode } from "../src/stubAssemblyTool.ts";
import type { AssemblyTool } from "../src/assemblyTool.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// retry-final-assembly (JOS-159), groups 2, 3 and 5 — assembly failure recorded on the session, output written
// only on success, and nothing generated touched by a failure or a retry.

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
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })) };
    },
  };
}

const TEST_VIDEO_PROVIDER = "test-video-provider";

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
  const scenes = getScenesForRun(runId);
  for (const scene of scenes) {
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

/** A full session ready for assembly: 2 chunk-complete scenes and a stored voice-over. */
/**
 * A full session ready for assembly: 2 chunk-complete scenes and a stored voice-over. `tool`, when given, is set
 * *before* the scenes reach chunk-complete — assembly auto-triggers the moment the last scene completes
 * (`triggerAssemblyIfReady`), so a test that wants to control what the first automatic attempt sees must set the
 * tool first, exactly like `assembly-phase.test.ts`'s own fixtures do. A test that wants the natural "no tool
 * configured" case passes no `tool` and lets `resetAssemblyTool()` (`beforeEach`) stand.
 */
async function readySession(tool?: ReturnType<typeof createStubAssemblyTool>): Promise<{ runId: string }> {
  const runId = randomUUID();
  createRun(runId, "Assembly recovery test", makeScript(2), "en");
  addFakeVoiceOver(runId, 2);
  if (tool) setAssemblyTool(tool);
  await bringToChunkComplete(runId, 2);
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

// ---- Group 2 — the assembly failure is recorded on the session (design Decision 1) ----

describe("An assembly failure is recorded on the session (JOS-159, design Decision 1)", () => {
  it("records the failure and derives failed/assembly when a cycle exhausts its retry budget", async () => {
    const { runId } = await readySession(createStubAssemblyTool({ kind: "transient-failure", reason: "stub transient" }));

    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);

    const run = getRun(runId)!;
    expect(run.failure).toMatchObject({ phase: "assembly", retryable: true });
    expect(run.failure!.cause).toContain("kept");
    expect(toSnapshot(runId)!.session.state).toBe("failed");
    expect(toSnapshot(runId)!.session.failedPhase).toBe("assembly");
    expect(getStageAttempts(runId, "assembly").length).toBe(1 + RETRY_BUDGET);
  });

  it("records the failure as not retryable when the tool fails not-retryably", async () => {
    const { runId } = await readySession(createStubAssemblyTool({ kind: "not-retryable-failure", reason: "stub not-retryable" }));

    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);

    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: false });
    expect(toSnapshot(runId)!.session.failedPhase).toBe("assembly");
    expect(getStageAttempts(runId, "assembly").length).toBe(1);
  });

  it("records a not-retryable failure with no tool configured, and the tool is never called", async () => {
    const { runId } = await readySession();
    // resetAssemblyTool() in beforeEach already leaves no tool set.

    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);

    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: false });
    expect(getStageAttempts(runId, "assembly").length).toBe(0);
  });

  it("records a not-retryable failure when the session has no voice-over, and the tool is never called", async () => {
    const runId = randomUUID();
    createRun(runId, "No voice-over", makeScript(1), "en");
    // No addFakeVoiceOver call.
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    await bringToChunkComplete(runId, 1);
    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);

    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: false });
    expect(getStageAttempts(runId, "assembly").length).toBe(0);
  });

  it("eventually records a failure when a scene's clip file is missing, through the ordinary attempt path", async () => {
    // design Decision 1's "found during implementation" note — there is no eager existsSync pre-check (it broke
    // several store-only test fixtures elsewhere in the suite), so a missing clip file is only ever discovered by
    // a tool that actually tries to read it, exactly like the real ffmpeg adapter would. This stub mimics that.
    // readySession() with no tool lets the automatic trigger run and fail once, harmlessly (no tool configured —
    // already pinned above). Deleting the clip file, clearing that stray failure and re-triggering with
    // launchHeldWork (the same technique "clears the failure on a later success" below uses) gives a clean,
    // deterministic run against the file-checking tool, with no race against the automatic first trigger.
    const { runId } = await readySession();
    const run = getRun(runId)!;
    const scene = getScenesForRun(runId)[0]!;
    unlinkSync(resolveArtefactPath(run.projectFolder, scene.videoResult!));
    clearRunFailure(runId);
    const realisticTool: AssemblyTool = {
      async assemble(input) {
        const missing = input.clips.some((c) => !existsSync(c.clipPath));
        if (missing) return { kind: "failed_not_retryable", reason: "a clip file is missing" };
        return createStubAssemblyTool({ kind: "success" }).assemble(input);
      },
    };
    setAssemblyTool(realisticTool);
    launchHeldWork(runId);

    await waitFor(() => getStageAttempts(runId, "assembly").some((a) => a.outcome === "not-retryable"), 5000);

    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: false });
  });

  it("clears the failure on a later success", async () => {
    const { runId } = await readySession();
    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);

    // retryAssembly isn't implemented yet in this test file's scope (group 4); simulate a later success the
    // same way the real retry service will: by launching assembly again once the failure is cleared.
    clearRunFailure(runId);
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));
    launchHeldWork(runId);

    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);
    expect(getRun(runId)!.failure).toBeNull();
  });

  it("never contains an absolute filesystem path in the cause", async () => {
    const { runId } = await readySession(
      createStubAssemblyTool({ kind: "not-retryable-failure", reason: "/Users/x/secret/final-video.mp4 is corrupt" }),
    );

    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);

    expect(getRun(runId)!.failure!.cause).not.toMatch(/\/Users\//);
  });
});

// ---- Group 3 — output only on success (design Decision 2) ----

describe("The final video appears in the project folder only on success (JOS-159, design Decision 2)", () => {
  function projectFiles(runId: string): string[] {
    const run = getRun(runId)!;
    return readdirSync(resolveArtefactPath(run.projectFolder, "."));
  }

  /** A stub that actually writes bytes to outputPath, like a real adapter would, then reports the given mode. */
  function fileWritingStub(mode: StubAssemblyMode): ReturnType<typeof createStubAssemblyTool> {
    return {
      async assemble(input) {
        writeFileSync(input.outputPath, MP4_BYTES);
        return createStubAssemblyTool(mode).assemble(input);
      },
    };
  }

  it("a failed attempt that wrote a partial output leaves the project folder listing unchanged", async () => {
    const { runId } = await readySession(fileWritingStub({ kind: "not-retryable-failure" }));
    const before = projectFiles(runId).filter((f) => f !== "final-video.mp4");

    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);

    expect(projectFiles(runId).sort()).toEqual(before.sort());
    expect(projectFiles(runId)).not.toContain("final-video.mp4");
  });

  it("a successful attempt adds exactly final-video.mp4 to the project folder", async () => {
    const runId = randomUUID();
    createRun(runId, "Assembly recovery test", makeScript(2), "en");
    addFakeVoiceOver(runId, 2);
    await bringToChunkComplete(runId, 2); // no tool yet: the natural first trigger fails harmlessly
    const before = projectFiles(runId);
    clearRunFailure(runId);
    setAssemblyTool(fileWritingStub({ kind: "success" }));
    launchHeldWork(runId);

    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);

    const after = projectFiles(runId);
    expect(after.filter((f) => !before.includes(f))).toEqual(["final-video.mp4"]);
    expect(readFileSync(resolveArtefactPath(getRun(runId)!.projectFolder, "final-video.mp4"))).toEqual(MP4_BYTES);
  });

  it("adopts a pre-existing readable final-video.mp4 with no recorded path, instead of calling the tool", async () => {
    const { runId } = await readySession(); // no tool: the natural first trigger fails harmlessly
    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);
    const run = getRun(runId)!;
    writeFileSync(resolveArtefactPath(run.projectFolder, "final-video.mp4"), MP4_BYTES);
    clearRunFailure(runId);
    let called = false;
    setAssemblyTool({
      async assemble(input) {
        called = true;
        return createStubAssemblyTool({ kind: "success" }).assemble(input);
      },
    });
    launchHeldWork(runId);

    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);

    expect(called).toBe(false);
    expect(getRun(runId)!.finalVideoPath).toBe("final-video.mp4");
  });

  it("never replaces an existing final video", async () => {
    const { runId } = await readySession(fileWritingStub({ kind: "success" }));
    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);
    const run = getRun(runId)!;
    const finalPath = resolveArtefactPath(run.projectFolder, "final-video.mp4");
    const originalBytes = readFileSync(finalPath);

    // A further launch attempt (finalVideoPath is already set) must be a complete no-op.
    launchHeldWork(runId);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(readFileSync(finalPath)).toEqual(originalBytes);
    expect(existsSync(finalPath)).toBe(true);
  });

  it("moveAssemblyOutput itself refuses a second move into an already-occupied path (the EEXIST branch runAssemblyAttempt's own early finalVideoPath guard never lets a real attempt reach)", () => {
    const runId = randomUUID();
    const run = createRun(runId, "moveAssemblyOutput unit test", "A script.", "en");
    const firstTemp = writeArtefactOnce(run.projectFolder, "first.tmp", MP4_BYTES);
    const secondTemp = writeArtefactOnce(run.projectFolder, "second.tmp", MP4_BYTES);

    expect(moveAssemblyOutput(run.projectFolder, resolveArtefactPath(run.projectFolder, firstTemp), "final-video.mp4")).toBe(true);
    expect(moveAssemblyOutput(run.projectFolder, resolveArtefactPath(run.projectFolder, secondTemp), "final-video.mp4")).toBe(false);
    // Both temp files are gone either way (the `finally` always removes them).
    expect(existsSync(resolveArtefactPath(run.projectFolder, firstTemp))).toBe(false);
    expect(existsSync(resolveArtefactPath(run.projectFolder, secondTemp))).toBe(false);
  });

  it("isReadableMp4 is false for a path that cannot be read, not just a bad file", () => {
    expect(isReadableMp4("/nonexistent/path/final-video.mp4")).toBe(false);
  });
});

// ---- Group 5 — a failure or a retry touches nothing generated (design Decision 6) ----

describe("Nothing generated is touched by an assembly failure or retry (JOS-159, design Decision 6)", () => {
  /** A full session with its own tracked video provider, so "the provider received nothing" is checkable. */
  async function sessionWithTrackedProvider(): Promise<{ runId: string; videoProvider: ReturnType<typeof createStubVideoProvider> }> {
    const runId = randomUUID();
    createRun(runId, "Assembly recovery test", makeScript(2), "en");
    addFakeVoiceOver(runId, 2);
    const videoProvider = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: TEST_VIDEO_PROVIDER, adapters: { [TEST_VIDEO_PROVIDER]: videoProvider } });
    setAssemblyTool(createStubAssemblyTool({ kind: "not-retryable-failure" }));
    await bringToChunkComplete(runId, 2);
    await waitFor(() => getRun(runId)?.failure?.phase === "assembly", 5000);
    return { runId, videoProvider };
  }

  it("leaves the voice-over, scenes, their stored results and files unchanged across a failed first run, a failed retry and a successful retry", async () => {
    const { runId, videoProvider } = await sessionWithTrackedProvider();
    const run = getRun(runId)!;
    const beforeScenes = getScenesForRun(runId);
    const beforeVoiceOver = getVoiceOver(runId);
    const beforeVoiceOverBytes = readFileSync(resolveArtefactPath(run.projectFolder, beforeVoiceOver!.audioPath));
    const beforeImageBytes = beforeScenes.map((s) => readFileSync(resolveArtefactPath(run.projectFolder, s.result!)));
    const videoCallsAfterFirstRun = videoProvider.calls.length;

    // A failed retry.
    setAssemblyTool(createStubAssemblyTool({ kind: "not-retryable-failure", reason: "still failing" }));
    expect(retryAssembly(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.failure?.cause.includes("still failing") ?? false, 5000);

    expect(getScenesForRun(runId)).toEqual(beforeScenes);
    expect(getVoiceOver(runId)).toEqual(beforeVoiceOver);
    expect(readFileSync(resolveArtefactPath(run.projectFolder, beforeVoiceOver!.audioPath))).toEqual(beforeVoiceOverBytes);
    expect(videoProvider.calls.length).toBe(videoCallsAfterFirstRun);

    // A successful retry.
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));
    expect(retryAssembly(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath != null, 5000);

    expect(getScenesForRun(runId)).toEqual(beforeScenes);
    expect(getVoiceOver(runId)).toEqual(beforeVoiceOver);
    expect(readFileSync(resolveArtefactPath(run.projectFolder, beforeVoiceOver!.audioPath))).toEqual(beforeVoiceOverBytes);
    beforeScenes.forEach((s, i) => expect(readFileSync(resolveArtefactPath(run.projectFolder, s.result!))).toEqual(beforeImageBytes[i]));
    expect(videoProvider.calls.length).toBe(videoCallsAfterFirstRun);

    // The tool receives the clips in scene order with their stored intervals.
    expect(captured).toHaveLength(1);
    expect(captured[0]!.clips.map((c) => c.narrationStartSeconds)).toEqual(beforeScenes.map((s) => s.narrationInterval!.startSeconds));
    expect(captured[0]!.clips.map((c) => c.narrationDurationSeconds)).toEqual(
      beforeScenes.map((s) => s.narrationInterval!.endSeconds - s.narrationInterval!.startSeconds),
    );
  });
});
