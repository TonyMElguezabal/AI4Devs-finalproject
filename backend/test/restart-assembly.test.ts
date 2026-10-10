import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  beginAssemblyRetry,
  clearRunFailure,
  commitSceneResult,
  completeStageAttempt,
  createRun,
  getRun,
  getScenesForRun,
  getStageAttempts,
  insertVoiceOver,
  markImageComplete,
  recordStageAttempt,
  resetAll,
  setFinalVideoPath,
  setRunFailure,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  assemblyStageLauncher,
  continueSession,
  launchVideoStageForRun,
  pauseSession,
  resetAssemblyLaunchCount,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  RETRY_BUDGET,
  setAssemblyTool,
} from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { simulateRestart } from "./restartHelpers.ts";

// preserve-progress-across-restarts (JOS-160), spec restart-recovery — "Pending work continues after a restart"
// for the final assembly, and "A restart never sends a unit of work twice".

const RESTART_CAUSE = "interrupted by a restart";
const SCENE_COUNT = 2;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000007800000044000000000000000000000000000", "hex"); // 1920x1088
const MP4 = Buffer.from("00000020667479706d703432", "hex");

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })) };
  },
};

async function waitFor(predicate: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyLaunchCount();
  resetAssemblyTool(); // no tool: the last chunk completing records no assembly attempt of its own
  setVideoProviderRegistry({
    defaultIdentifier: "restart-video",
    adapters: { "restart-video": createStubVideoProvider("success-bytes", { bytes: MP4 }) },
  });
});

/** A session whose scenes are all chunk-complete, with its voice-over stored and no assembly attempt yet. */
async function sessionReadyToAssemble(): Promise<string> {
  const runId = randomUUID();
  const fragments: SegmentedFragment[] = Array.from({ length: SCENE_COUNT }, (_, i) => ({
    text: `Scene ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
  const { projectFolder } = createRun(runId, "Restart assembly", fragments.map((f) => f.text).join(" "), "en");
  const audioPath = writeArtefactOnce(projectFolder, "voice-over.mp3", Buffer.from("fake-mp3"));
  insertVoiceOver({
    runId,
    audioPath,
    timestampsPath: null,
    durationSeconds: SCENE_COUNT * 5,
    sizeBytes: 8,
    nativeTimestampsAvailable: false,
    providerRequestId: "req-1",
    completedAt: new Date().toISOString(),
  });
  const registered = await registerDecomposition(runId, fragments, generator, SCENE_COUNT * 5);
  if (!registered.ok) throw new Error(`registration failed: ${registered.reason}`);
  for (const scene of getScenesForRun(runId)) {
    const result = writeArtefactOnce(projectFolder, `scene-${scene.index}.png`, PNG);
    commitSceneResult(scene.id, result);
    markImageComplete(scene.id, result);
  }
  launchVideoStageForRun(runId);
  await waitFor(() => getScenesForRun(runId).every((scene) => scene.status === "chunk-complete"));
  // retry-final-assembly (JOS-159) — the last chunk completing auto-triggers assembly, and with no tool set
  // (`beforeEach`) it now records a "no tool configured" failure instead of silently doing nothing. Every test
  // in this file wants a clean slate to insert its own attempts into, not this stray one.
  clearRunFailure(runId);
  return runId;
}

/** Records `count` assembly attempts: all but the last ended transient, the last still in flight (the one a restart interrupts). */
function interruptAssemblyAfter(runId: string, count: number): void {
  for (let attempt = 1; attempt <= count; attempt++) {
    const sentAt = new Date().toISOString();
    const recorded = recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: sentAt, sentAt });
    if (attempt < count) completeStageAttempt(recorded.id, { outcome: "transient", finishedAt: sentAt, errorMessage: "stub transient failure" });
  }
}

/**
 * retry-final-assembly (JOS-159), task 4.4 — a cycle already fully settled with no failure recorded: the state
 * the pre-JOS-159 code could leave a session in (PR #25 never called `setRunFailure`). `outcome` is the last
 * attempt's own outcome, never "in-flight" — that is `interruptAssemblyAfter`'s scenario, not this one.
 */
function settleExhaustedAssemblyCycleWithNoFailure(runId: string, count: number, outcome: "transient" | "not-retryable"): void {
  for (let attempt = 1; attempt <= count; attempt++) {
    const sentAt = new Date().toISOString();
    const recorded = recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: sentAt, sentAt });
    completeStageAttempt(recorded.id, { outcome: attempt < count ? "transient" : outcome, finishedAt: sentAt, errorMessage: "stub failure from before JOS-159" });
  }
}

describe("Assembly interrupted by a restart (4.2)", () => {
  it("is launched once as the next attempt of the same sequence when attempts are left", async () => {
    const runId = await sessionReadyToAssemble();
    interruptAssemblyAfter(runId, 1);
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    simulateRestart();
    await waitFor(() => getRun(runId)!.finalVideoPath !== null);

    const attempts = getStageAttempts(runId, "assembly");
    expect(attempts.map((a) => [a.sequenceInCycle, a.outcome])).toEqual([[1, "transient"], [2, "success"]]);
    expect(attempts[0]!.errorMessage).toBe(RESTART_CAUSE);
  });

  it("keeps counting the budget across the restart: the last attempt's budget is spent, so nothing is launched", async () => {
    const runId = await sessionReadyToAssemble();
    interruptAssemblyAfter(runId, 1 + RETRY_BUDGET);
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    simulateRestart();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getStageAttempts(runId, "assembly").map((a) => a.outcome)).toEqual(["transient", "transient", "transient", "transient"]);
    expect(getRun(runId)!.finalVideoPath).toBeNull();
  });

  it("is not launched when the latest attempt was not retryable", async () => {
    const runId = await sessionReadyToAssemble();
    const sentAt = new Date().toISOString();
    const attempt = recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: sentAt, sentAt });
    completeStageAttempt(attempt.id, { outcome: "not-retryable", finishedAt: sentAt, errorMessage: "stub not-retryable failure" });
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    simulateRestart();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getStageAttempts(runId, "assembly")).toHaveLength(1);
    expect(getRun(runId)!.finalVideoPath).toBeNull();
  });

  it("is not launched for a paused session", async () => {
    const runId = await sessionReadyToAssemble();
    interruptAssemblyAfter(runId, 1);
    pauseSession(runId);
    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));

    simulateRestart();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getStageAttempts(runId, "assembly").map((a) => a.outcome)).toEqual(["transient"]);
    expect(getRun(runId)!.finalVideoPath).toBeNull();
  });
});

describe("Boot migration — a pre-JOS-159 session stuck with no recorded failure (task 4.4)", () => {
  it("gets its failure recorded at boot, once, from a budget-exhausted cycle", async () => {
    const runId = await sessionReadyToAssemble();
    settleExhaustedAssemblyCycleWithNoFailure(runId, 1 + RETRY_BUDGET, "transient");
    expect(getRun(runId)!.failure).toBeNull();

    simulateRestart();

    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: true });
    expect(getStageAttempts(runId, "assembly")).toHaveLength(1 + RETRY_BUDGET); // unchanged — no attempt recorded by the boot step itself

    simulateRestart(); // a second boot must not re-broadcast or alter an already-recorded failure
    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: true });
  });

  it("gets its failure recorded at boot from a not-retryable last attempt", async () => {
    const runId = await sessionReadyToAssemble();
    settleExhaustedAssemblyCycleWithNoFailure(runId, 1, "not-retryable");

    simulateRestart();

    expect(getRun(runId)!.failure).toMatchObject({ phase: "assembly", retryable: false });
  });

  it("leaves a session with no assembly attempts at all untouched", async () => {
    // Paused so the unrelated relaunch-on-boot pass (`relaunchPendingWork`) does not itself trigger a fresh
    // "no tool configured" attempt and failure — isolating the migration step's own behaviour.
    const runId = await sessionReadyToAssemble();
    pauseSession(runId);

    simulateRestart();

    expect(getRun(runId)!.failure).toBeNull();
  });

  it("leaves a session whose final video is already recorded untouched, even with a stale transient attempt", async () => {
    const runId = await sessionReadyToAssemble();
    settleExhaustedAssemblyCycleWithNoFailure(runId, 1 + RETRY_BUDGET, "transient");
    setFinalVideoPath(runId, "final-video.mp4");

    simulateRestart();

    expect(getRun(runId)!.failure).toBeNull();
  });

  it("does not undo a retry accepted and held by a pause, interrupted by a restart before continue (found manually testing 10.3/10.4)", async () => {
    // The exact shape a boot migration can't tell apart from a genuinely stuck legacy session just from attempt
    // rows alone: a not-retryable latest attempt, no failure (beginAssemblyRetry already cleared it), paused.
    // Re-recording the old failure here would silently discard the User's already-accepted retry.
    const runId = await sessionReadyToAssemble();
    settleExhaustedAssemblyCycleWithNoFailure(runId, 1, "not-retryable");
    setRunFailure(runId, { phase: "assembly", cause: "stub failure", retryable: false, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 1, occurredAt: new Date().toISOString() });
    pauseSession(runId);
    expect(beginAssemblyRetry(runId)).toBe(true);
    expect(getRun(runId)!.failure).toBeNull();

    simulateRestart();

    expect(getRun(runId)!.failure).toBeNull();
    expect(assemblyStageLauncher.heldWork(runId).count).toBe(1);

    setAssemblyTool(createStubAssemblyTool({ kind: "success" }));
    continueSession(runId);
    await waitFor(() => getRun(runId)!.finalVideoPath !== null);
    expect(getRun(runId)!.failure).toBeNull();
  });
});
