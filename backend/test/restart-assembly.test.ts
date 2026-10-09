import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
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
  writeArtefactOnce,
} from "../src/db.ts";
import {
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
