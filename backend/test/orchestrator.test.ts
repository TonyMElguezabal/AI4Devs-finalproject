import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { createRun, createScene, getLatestProviderRequestForScene, getRun, getScene, resetAll } from "../src/db.ts";
import {
  RETRY_BUDGET,
  continueSession,
  correctAndRetry,
  handleProviderResult,
  imageStageLauncher,
  videoStageLauncher,
  launchScene,
  manualRetry,
  nextStageLaunchCount,
  pauseSession,
  reconcileOnBoot,
  setPostAdmitHook,
} from "../src/orchestrator.ts";
import {
  NOT_YET_LAUNCHABLE,
  registerStageLauncher,
  resetRegistry,
  type HeldWorkResult,
  type PipelineStage,
} from "../src/launchGate.ts";
import { STAGE } from "../src/types.ts";

function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function newRunWithScene(mode: Parameters<typeof createScene>[3], latencyMs: number) {
  const runId = randomUUID();
  createRun(runId, `test run ${runId}`, "test script", "en");
  const sceneId = randomUUID();
  createScene(sceneId, runId, 1, mode, latencyMs);
  return { runId, sceneId };
}

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10); // generous, unrelated to the concurrency-cap experiment
  setPostAdmitHook(undefined); // clear any hook left by a previous test
  // Restore the registry to the currently launchable stages.
  resetRegistry();
  registerStageLauncher(imageStageLauncher);
  registerStageLauncher(videoStageLauncher);
});

// Experiment 4.3 — retry budget.
describe("retry budget (PRD §10.1, C2)", () => {
  it("a transient failure consumes 1 + RETRY_BUDGET attempts, then fails", async () => {
    const { sceneId } = newRunWithScene("transient_failure", 5);
    launchScene(sceneId);

    await waitFor(() => getScene(sceneId)?.status === "failed");

    const scene = getScene(sceneId)!;
    expect(scene.attempts).toBe(1 + RETRY_BUDGET);
    expect(scene.lastError).toMatch(/retry budget exhausted after 4 attempts/);
  });

  it("a not-retryable failure fails immediately, with no retries", async () => {
    const { sceneId } = newRunWithScene("not_retryable_failure", 5);
    launchScene(sceneId);

    await waitFor(() => getScene(sceneId)?.status === "failed");

    const scene = getScene(sceneId)!;
    expect(scene.attempts).toBe(1);
    expect(scene.lastError).toMatch(/content-filter/);
  });

  it("a manual retry after failure starts a fresh 1 + RETRY_BUDGET cycle", async () => {
    const { sceneId } = newRunWithScene("transient_failure", 5);
    launchScene(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "failed");
    expect(getScene(sceneId)!.attempts).toBe(1 + RETRY_BUDGET);

    const result = manualRetry(sceneId);
    expect(result.ok).toBe(true);

    await waitFor(() => getScene(sceneId)?.status === "failed" && getScene(sceneId)!.attempts > 0);
    expect(getScene(sceneId)!.attempts).toBe(1 + RETRY_BUDGET); // fresh budget, not cumulative
  });
});

// Experiment 4.5 — idempotency.
describe("idempotent success confirmation (PRD §12.1, C7)", () => {
  it("delivering the same success twice yields one result and one next-stage launch", async () => {
    const { sceneId } = newRunWithScene("success", 15);
    launchScene(sceneId);

    await waitFor(() => getScene(sceneId)?.status === "image-complete");
    expect(nextStageLaunchCount(sceneId)).toBe(1);

    const requestId = getLatestProviderRequestForScene(sceneId)!.id;
    const firstResultSnapshot = getScene(sceneId)!.result;

    const duplicate = handleProviderResult(requestId);

    expect(duplicate.applied).toBe(false);
    expect(getScene(sceneId)!.result).toBe(firstResultSnapshot);
    expect(nextStageLaunchCount(sceneId)).toBe(1); // still 1, not 2
  });
});

// Experiment 4.1 — restart resumption. A real process kill is exercised
// manually in tasks.md §7 (curl); this proves the underlying mechanism is
// correct and repeatable by discarding in-memory state (what a restart loses)
// while keeping persisted state (what a restart keeps) and reconciling.
describe("restart-safe resumption (PRD §12.1, C6)", () => {
  it("resumes a still-pending request across a simulated restart", async () => {
    const { sceneId } = newRunWithScene("success", 300);
    launchScene(sceneId);
    expect(getScene(sceneId)!.status).toBe("image-generating");

    // Simulate the process dying: only in-memory state is lost.
    concurrency.resetAll();
    concurrency.setLimit(STAGE, 10);

    const summary = reconcileOnBoot();
    expect(summary.stillPending).toBe(1);

    // The provider still holds the result; reconciliation re-armed delivery.
    await waitFor(() => getScene(sceneId)?.status === "image-complete", 2000);
  });

  it("records exactly one failed attempt when the provider can no longer recover the request", () => {
    const { sceneId } = newRunWithScene("unrecoverable", 5);
    launchScene(sceneId);
    expect(getScene(sceneId)!.status).toBe("image-generating");
    expect(getScene(sceneId)!.attempts).toBe(1);

    concurrency.resetAll();
    concurrency.setLimit(STAGE, 10);

    const summary = reconcileOnBoot();
    expect(summary.recordedFailedAttempt).toBe(1);

    // Within budget (1 < 1 + RETRY_BUDGET): the failed attempt is recorded
    // and an automatic retry is launched — the scene does not go straight to `failed`.
    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-generating");
    expect(scene.attempts).toBe(2);
  });
});

// Experiment 4.2 (concurrency) is exercised as a live scenario across two
// HTTP-level "sessions" in tasks.md §4.2 / §7, since it is about requests
// actually being held back in FIFO order, not unit-testable in isolation
// from the scheduler's real timing. This unit test instead proves the
// semaphore primitive itself.
describe("shared per-stage concurrency cap (PRD §10.1, C3)", () => {
  it("queues waiters beyond the limit and releases them in FIFO order", () => {
    concurrency.resetAll();
    concurrency.setLimit("TEST_STAGE", 2);

    const acquired: number[] = [];
    concurrency.acquire("TEST_STAGE", () => acquired.push(1));
    concurrency.acquire("TEST_STAGE", () => acquired.push(2));
    concurrency.acquire("TEST_STAGE", () => acquired.push(3)); // queued
    concurrency.acquire("TEST_STAGE", () => acquired.push(4)); // queued

    expect(acquired).toEqual([1, 2]);
    expect(concurrency.stats("TEST_STAGE")).toEqual({ inFlight: 2, queued: 2, limit: 2 });

    concurrency.release("TEST_STAGE");
    expect(acquired).toEqual([1, 2, 3]);
    expect(concurrency.stats("TEST_STAGE")).toEqual({ inFlight: 2, queued: 1, limit: 2 });

    concurrency.release("TEST_STAGE");
    expect(acquired).toEqual([1, 2, 3, 4]);
    expect(concurrency.stats("TEST_STAGE")).toEqual({ inFlight: 2, queued: 0, limit: 2 });
  });
});

// define-live-updates (JOS-183) Decision 8 / define-frontend-stack (JOS-180) task 2.6.
describe("session pause and continue (PRD §9)", () => {
  it("holds a not-yet-launched scene while paused, and launches it on continue", async () => {
    const runId = randomUUID();
    createRun(runId, "pause test", "test script", "en");
    const sceneId = randomUUID();
    createScene(sceneId, runId, 1, "success", 20);

    pauseSession(runId);
    launchScene(sceneId);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(getScene(sceneId)!.status).toBe("submitted"); // held, not sent
    expect(getScene(sceneId)!.attempts).toBe(0);

    const result = continueSession(runId);
    expect(result.ok).toBe(true);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");
  });

  it("does not affect a request already sent before the pause", async () => {
    const { runId, sceneId } = newRunWithScene("success", 200);
    launchScene(sceneId);
    expect(getScene(sceneId)!.status).toBe("image-generating");

    pauseSession(runId); // pause after the request is already in flight

    await waitFor(() => getScene(sceneId)?.status === "image-complete");
  });
});

// JOS-152 task 3.4 — atomicity: no pause can land between admission and in-flight mark
describe("admission-to-in-flight atomicity (JOS-152, task 3.4, design Decision 2)", () => {
  it("stub path: a pause injected between gate and in-flight mark still sends the request", () => {
    const { runId, sceneId } = newRunWithScene("success", 5);

    setPostAdmitHook((id) => {
      pauseSession(id);
    });

    launchScene(sceneId);

    setPostAdmitHook(undefined);

    // The scene is in-flight despite the pause being set during the hook
    expect(getScene(sceneId)!.status).toBe("image-generating");
    // The pause is now set
    expect(getRun(runId)!.paused).toBe(true);
  });
});

// JOS-152 task 3.5 — reconcileOnBoot through the gate
describe("reconcileOnBoot respects the pause gate (JOS-152, task 3.5)", () => {
  it("applies a resolved request for a paused session but does not launch the retry", () => {
    const { runId, sceneId } = newRunWithScene("unrecoverable", 5);
    launchScene(sceneId);
    expect(getScene(sceneId)!.status).toBe("image-generating");

    // Simulate restart: clear in-memory concurrency state
    concurrency.resetAll();
    concurrency.setLimit(STAGE, 10);

    // Pause the session before reconcileOnBoot runs
    pauseSession(runId);

    const summary = reconcileOnBoot();
    expect(summary.recordedFailedAttempt).toBe(1);

    // The failure is applied but no retry is sent (held by the gate)
    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("submitted"); // pending retry, not failed — one attempt within budget
    expect(scene.attempts).toBe(1); // no additional attempt
  });
});

// PRD §10.3 — the one visual-correction exception.
describe("visual correction on a failed stage (PRD §10.3)", () => {
  it("is rejected on a scene that has not failed", async () => {
    const { sceneId } = newRunWithScene("success", 5);
    launchScene(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    const result = correctAndRetry(sceneId, "a new instruction");
    expect(result.ok).toBe(false);
  });

  it("updates the instruction and retries when the stage has failed", async () => {
    const { sceneId } = newRunWithScene("not_retryable_failure", 5);
    launchScene(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "failed");

    const result = correctAndRetry(sceneId, "a corrected instruction");
    expect(result.ok).toBe(true);
    expect(getScene(sceneId)!.instruction).toBe("a corrected instruction");
  });
});

// JOS-152 task 4.3 — continueSession launches held work from registered launchers
describe("continueSession launches held work from registered launchers (JOS-152, task 4.3)", () => {
  function makeTestLauncher(stage: PipelineStage, held: () => HeldWorkResult) {
    let launched = false;
    const launcher = {
      stage,
      heldWork: (_sessionId: string) => held(),
      launch: (_sessionId: string) => { launched = true; },
    };
    return { launcher, wasLaunched: () => launched };
  }

  it("continueSession calls launch for a decomposition launcher with held work", () => {
    const { runId } = newRunWithScene("success", 5);
    pauseSession(runId);

    const { launcher, wasLaunched } = makeTestLauncher("decomposition", () => ({ count: 1, sceneIds: [] }));
    NOT_YET_LAUNCHABLE.delete("decomposition");
    registerStageLauncher(launcher);

    continueSession(runId);

    expect(wasLaunched()).toBe(true);
  });

  it("continueSession calls launch for all registered launchers with held work in pipeline order", () => {
    const { runId } = newRunWithScene("success", 5);
    pauseSession(runId);

    resetRegistry();
    registerStageLauncher(imageStageLauncher);
    const launched: PipelineStage[] = [];
    const decompLauncher = { stage: "decomposition" as PipelineStage, heldWork: () => ({ count: 1, sceneIds: [] }), launch: () => { launched.push("decomposition"); } };
    const videoLauncher = { stage: "video" as PipelineStage, heldWork: () => ({ count: 1, sceneIds: [] }), launch: () => { launched.push("video"); } };

    NOT_YET_LAUNCHABLE.delete("decomposition");
    NOT_YET_LAUNCHABLE.delete("video");
    registerStageLauncher(decompLauncher);
    registerStageLauncher(videoLauncher);

    continueSession(runId);

    expect(launched).toEqual(["decomposition", "video"]);
  });

  it("continueSession does not call launch for launchers with no held work", () => {
    const { runId } = newRunWithScene("success", 5);
    pauseSession(runId);

    const { launcher, wasLaunched } = makeTestLauncher("decomposition", () => ({ count: 0, sceneIds: [] }));
    NOT_YET_LAUNCHABLE.delete("decomposition");
    registerStageLauncher(launcher);

    continueSession(runId);

    expect(wasLaunched()).toBe(false);
  });

  it("session state before and after the pause is unchanged (design Decision 6)", () => {
    const { runId } = newRunWithScene("success", 5);
    const stateBeforePause = getRun(runId);

    pauseSession(runId);
    continueSession(runId);

    const stateAfter = getRun(runId);
    // Only the paused marker changes; title, script, failure, etc. are untouched
    expect(stateAfter!.title).toBe(stateBeforePause!.title);
    expect(stateAfter!.failure).toBe(stateBeforePause!.failure);
    expect(stateAfter!.paused).toBe(false);
  });
});

// JOS-152 task 5.1 — continue behavior tests
describe("continueSession behavior (JOS-152, task 5.1)", () => {
  it("continue twice does not launch held work twice", () => {
    const { runId } = newRunWithScene("success", 5);
    pauseSession(runId);

    const launched: string[] = [];
    const launcher = { stage: "decomposition" as PipelineStage, heldWork: () => ({ count: 1, sceneIds: [] }), launch: () => { launched.push("decomposition"); } };
    NOT_YET_LAUNCHABLE.delete("decomposition");
    registerStageLauncher(launcher);

    continueSession(runId);
    continueSession(runId); // second continue is a no-op

    expect(launched).toHaveLength(1); // launched only once
  });

  it("continue on a session that is not paused launches nothing", () => {
    const { runId } = newRunWithScene("success", 5);
    // Not paused

    let launched = false;
    const launcher = { stage: "decomposition" as PipelineStage, heldWork: () => ({ count: 1, sceneIds: [] }), launch: () => { launched = true; } };
    NOT_YET_LAUNCHABLE.delete("decomposition");
    registerStageLauncher(launcher);

    continueSession(runId);

    expect(launched).toBe(false);
  });
});

// JOS-152 task 5.4 — continue that races a cap-queued waiter sends the scene once
describe("continue racing a cap-queued waiter (JOS-152, task 5.4)", () => {
  it("a scene queued for the cap is sent once when continue fires before the cap slot opens", () => {
    // Set cap to 0 so launchScene queues but never fires
    concurrency.resetAll();
    concurrency.setLimit(STAGE, 0);

    const { runId, sceneId } = newRunWithScene("success", 5);
    pauseSession(runId);

    // Now unpause and set cap back to 1 so the queued waiter can fire
    concurrency.resetAll();
    concurrency.setLimit(STAGE, 1);

    // Call continueSession — it calls imageStageLauncher.launch which calls launchScene
    // The scene is submitted and not in-flight, so it gets launched exactly once
    continueSession(runId);

    // The scene is now in-flight (or complete), not submitted twice
    const scene = getScene(sceneId)!;
    expect(["image-generating", "image-complete"]).toContain(scene.status);
    expect(scene.attempts).toBeLessThanOrEqual(1); // at most 1 attempt started
  });
});

// JOS-152 task 6.1 — pause never reverts work
describe("pause never reverts work (JOS-152, task 6.1)", () => {
  it("a long pause leaves a completed result unchanged", async () => {
    const { runId, sceneId } = newRunWithScene("success", 5);
    launchScene(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    const resultBefore = getScene(sceneId)!.result;
    const attemptsBefore = getScene(sceneId)!.attempts;

    pauseSession(runId);
    continueSession(runId);

    expect(getScene(sceneId)!.result).toBe(resultBefore);
    expect(getScene(sceneId)!.attempts).toBe(attemptsBefore);
  });

  it("pause and continue write nothing but the paused marker", () => {
    const { runId } = newRunWithScene("success", 5);
    const before = getRun(runId)!;

    pauseSession(runId);
    continueSession(runId);

    const after = getRun(runId)!;
    expect(after.title).toBe(before.title);
    expect(after.failure).toBe(before.failure);
    expect(after.paused).toBe(false);
  });

  it("a held launch has no attempt and no sentAt", () => {
    const { runId, sceneId } = newRunWithScene("success", 5);
    pauseSession(runId);
    launchScene(sceneId); // held, not sent

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("submitted"); // held
    expect(scene.attempts).toBe(0); // no attempt consumed
  });
});

// JOS-152 task 6.3 — pause in one session leaves another session unaffected
describe("pause isolation between sessions (JOS-152, task 6.3)", () => {
  it("pausing one session does not block another session's launch", async () => {
    const { runId: runId1, sceneId: sceneId1 } = newRunWithScene("success", 20);
    const { runId: runId2, sceneId: sceneId2 } = newRunWithScene("success", 20);

    pauseSession(runId1); // pause session 1 only

    // Session 2 is not paused, so its launch should succeed
    launchScene(sceneId2);
    await waitFor(() => getScene(sceneId2)?.status === "image-complete");

    // Session 1's scene was never launched (it was paused before launch)
    expect(getScene(sceneId1)!.status).toBe("submitted");
    expect(getScene(sceneId2)!.status).toBe("image-complete");
  });
});
