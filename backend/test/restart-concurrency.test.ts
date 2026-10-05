import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  createRun,
  createScene,
  db,
  getRun,
  getScene,
  resetAll,
  sceneCurrentRequestId,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  handleProviderResult,
  launchScene,
  launchVideoStage,
  reconcileOnBoot,
  resetVideoPollIntervalMs,
  resetVideoStageStartDelayMs,
  setVideoPollIntervalMs,
} from "../src/orchestrator.ts";
import {
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
  type VideoGenerationResult,
  type VideoProvider,
} from "../src/videoProvider.ts";
import { STAGE } from "../src/types.ts";

// harden-backend-foundation (JOS-186), spec restart-safe-concurrency: requests
// already sent before a restart count against the stage cap from boot.
// A restart is simulated the same way `orchestrator.test.ts` does: in-memory
// state (the semaphore) is discarded, persisted state is kept, then reconciled.

const VIDEO_STAGE = "video";
const VIDEO_PROVIDER_ID = "restart-test-video-adapter";
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

/** Records the highest in-flight count seen while the test runs. */
function trackPeakInFlight(stage: string): { peak: () => number; stop: () => void } {
  let peak = 0;
  const timer = setInterval(() => {
    peak = Math.max(peak, concurrency.stats(stage).inFlight);
  }, 1);
  return { peak: () => peak, stop: () => clearInterval(timer) };
}

function simulateRestart(limits: { image?: number; video?: number }): void {
  concurrency.resetAll();
  if (limits.image !== undefined) concurrency.setLimit(STAGE, limits.image);
  if (limits.video !== undefined) concurrency.setLimit(VIDEO_STAGE, limits.video);
}

/**
 * Delivers the answer of every request that is due. The stub's own delivery timer can fire a
 * millisecond before `sent_at + latency` on the wall clock and then drop the delivery as "not
 * ready"; these tests check slot accounting, not delivery timing, so a due delivery is retried.
 * `handleProviderResult` is idempotent, so a repeated delivery changes nothing. Returns true.
 */
function deliverDue(sceneIds: string[]): true {
  for (const sceneId of sceneIds) {
    const requestId = sceneCurrentRequestId(sceneId);
    if (requestId && getScene(sceneId)!.status === "image-generating") handleProviderResult(requestId);
  }
  return true;
}

function newImageScene(runId: string, index: number, mode: Parameters<typeof createScene>[3], latencyMs: number): string {
  const sceneId = randomUUID();
  createScene(sceneId, runId, index, mode, latencyMs);
  return sceneId;
}

function newRun(): string {
  const runId = randomUUID();
  createRun(runId, `restart concurrency ${runId}`, "script", "en");
  return runId;
}

/** A video provider whose polls answer from a table (default: pending) and that counts submissions. */
function scriptedVideoProvider(): VideoProvider & {
  answers: Map<string, VideoGenerationResult>;
  polled: Set<string>;
  submits: () => number;
} {
  const answers = new Map<string, VideoGenerationResult>();
  const polled = new Set<string>();
  let submitted = 0;
  return {
    answers,
    polled,
    submits: () => submitted,
    async submit() {
      submitted++;
      return { kind: "submitted", requestId: `new-request-${submitted}` };
    },
    async poll(requestId) {
      polled.add(requestId);
      return answers.get(requestId) ?? { kind: "pending" };
    },
  };
}

/** A scene whose clip request was sent before the restart and is still pending. */
function pendingVideoScene(runId: string, index: number, requestId: string): string {
  const sceneId = randomUUID();
  db.prepare(
    "INSERT INTO scenes (id, run_id, idx, status, attempts, current_request_id, video_provider, updated_at) VALUES (?, ?, ?, 'video-generating', 1, ?, ?, ?)",
  ).run(sceneId, runId, index, requestId, VIDEO_PROVIDER_ID, new Date().toISOString());
  return sceneId;
}

/** A scene ready for a brand-new clip request (image stored, duration set). */
function imageCompleteScene(runId: string, index: number): string {
  const sceneId = randomUUID();
  const run = getRun(runId)!;
  const imagePath = writeArtefactOnce(run.projectFolder, `scene-${index}.png`, PNG_BYTES);
  db.prepare(
    "INSERT INTO scenes (id, run_id, idx, status, result, requested_duration_seconds, updated_at) VALUES (?, ?, ?, 'image-complete', ?, 8, ?)",
  ).run(sceneId, runId, index, imagePath, new Date().toISOString());
  return sceneId;
}

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  resetVideoStageStartDelayMs();
  resetVideoProviderRegistry();
  setVideoPollIntervalMs(5);
});

describe("image stage: stub requests pending at boot (spec: Requests in flight at restart count against the cap)", () => {
  it("occupy slots before new work launches, and a new launch queues without sending", () => {
    const runId = newRun();
    const first = newImageScene(runId, 1, "success", 300);
    const second = newImageScene(runId, 2, "success", 300);
    concurrency.setLimit(STAGE, 2);
    launchScene(first);
    launchScene(second);

    simulateRestart({ image: 2 });
    reconcileOnBoot();

    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 0, limit: 2 });

    const third = newImageScene(runId, 3, "success", 300);
    launchScene(third);

    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 1, limit: 2 });
    expect(getScene(third)!.status).toBe("submitted");
    expect(getScene(third)!.attempts).toBe(0);
  });

  it("hand a freed slot to the waiting launch without going above the cap", async () => {
    const runId = newRun();
    const first = newImageScene(runId, 1, "success", 60);
    const second = newImageScene(runId, 2, "success", 60);
    concurrency.setLimit(STAGE, 2);
    launchScene(first);
    launchScene(second);

    simulateRestart({ image: 2 });
    reconcileOnBoot();
    const third = newImageScene(runId, 3, "success", 10);
    launchScene(third);

    const tracker = trackPeakInFlight(STAGE);
    await waitFor(() => deliverDue([third]) && getScene(third)!.status === "image-complete");
    tracker.stop();

    expect(tracker.peak()).toBeLessThanOrEqual(2);
    expect(getScene(third)!.attempts).toBe(1);
  });

  it("a request the provider lost holds no slot, and its retry queues behind pending ones", () => {
    const runId = newRun();
    // Created lost-first so a table-order reconcile would reach it before the pending one.
    const lost = newImageScene(runId, 1, "unrecoverable", 5);
    const pending = newImageScene(runId, 2, "success", 5_000);
    concurrency.setLimit(STAGE, 2);
    launchScene(lost);
    launchScene(pending);

    simulateRestart({ image: 1 });
    reconcileOnBoot();

    expect(getScene(pending)!.status).toBe("image-generating");
    expect(getScene(lost)!.attempts).toBe(1); // one failed attempt recorded, no retry sent yet
    expect(getScene(lost)!.status).toBe("submitted");
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 1, queued: 1, limit: 1 });
  });
});

describe("video stage: requests pending at boot", () => {
  it("count all of them against the cap and poll all of them right away", async () => {
    const provider = scriptedVideoProvider();
    setVideoProviderRegistry({ defaultIdentifier: VIDEO_PROVIDER_ID, adapters: { [VIDEO_PROVIDER_ID]: provider } });
    const runId = newRun();
    const requestIds = [1, 2, 3, 4, 5].map((n) => `sent-before-restart-${n}`);
    requestIds.forEach((requestId, i) => pendingVideoScene(runId, i + 1, requestId));

    simulateRestart({ video: 3 });
    reconcileOnBoot();

    expect(concurrency.stats(VIDEO_STAGE)).toEqual({ inFlight: 5, queued: 0, limit: 3 });

    await waitFor(() => requestIds.every((id) => provider.polled.has(id)));

    // A new launch waits: 5 in flight is above the cap of 3.
    const fresh = imageCompleteScene(runId, 6);
    launchVideoStage(fresh);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(provider.submits()).toBe(0);
    expect(concurrency.stats(VIDEO_STAGE).queued).toBe(1);
  });

  it("send no new request until fewer than the cap are in flight", async () => {
    const provider = scriptedVideoProvider();
    setVideoProviderRegistry({ defaultIdentifier: VIDEO_PROVIDER_ID, adapters: { [VIDEO_PROVIDER_ID]: provider } });
    const runId = newRun();
    const requestIds = [1, 2, 3, 4].map((n) => `sent-before-restart-${n}`);
    requestIds.forEach((requestId, i) => pendingVideoScene(runId, i + 1, requestId));

    simulateRestart({ video: 3 });
    reconcileOnBoot();
    const fresh = imageCompleteScene(runId, 5);
    launchVideoStage(fresh);

    // Settling one request leaves 3 in flight: still at the cap, so nothing is sent.
    provider.answers.set(requestIds[0]!, { kind: "failed_not_retryable", reason: "stub: settled" });
    await waitFor(() => concurrency.stats(VIDEO_STAGE).inFlight === 3);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(provider.submits()).toBe(0);

    // Settling a second one drops below the cap: the waiting launch takes the slot.
    provider.answers.set(requestIds[1]!, { kind: "failed_not_retryable", reason: "stub: settled" });
    await waitFor(() => provider.submits() === 1);
    expect(concurrency.stats(VIDEO_STAGE).queued).toBe(0);
  });
});

describe("the cap holds across a restart and a burst of new work", () => {
  it("never goes above the cap except for requests sent before the restart, and starts every queued launch once", async () => {
    const runId = newRun();
    const pendingIds = [1, 2].map((n) => newImageScene(runId, n, "success", 80));
    concurrency.setLimit(STAGE, 2);
    pendingIds.forEach(launchScene);

    simulateRestart({ image: 2 });
    reconcileOnBoot();

    const burstIds = [3, 4, 5, 6].map((n) => newImageScene(runId, n, "success", 20));
    burstIds.forEach(launchScene);
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 4, limit: 2 });

    const tracker = trackPeakInFlight(STAGE);
    await waitFor(() => deliverDue(burstIds) && burstIds.every((id) => getScene(id)!.status === "image-complete"), 5000);
    tracker.stop();

    expect(tracker.peak()).toBeLessThanOrEqual(2);
    for (const id of burstIds) expect(getScene(id)!.attempts).toBe(1);
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 0, queued: 0, limit: 2 });
  });
});
