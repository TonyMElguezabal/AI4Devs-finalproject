import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { createRun, db, getScene, resetAll } from "../src/db.ts";
import { resetAssemblyTool, resetVideoPollIntervalMs, resetVideoStageStartDelayMs, setAssemblyTool, setVideoPollIntervalMs } from "../src/orchestrator.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import { resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry, STUB_VIDEO_PROVIDER_NAME } from "../src/videoProvider.ts";
import { simulateRestart } from "./restartHelpers.ts";
import { MP4_BYTES, switchableProvider } from "./videoTaskFixtures.ts";

// keep-clip-task-on-timeout (JOS-204), spec chunk-video-generation "An interrupted clip resumes after a restart" — after a
// restart the same provider task keeps being followed, and the wait is counted from the original send.

const BOOT = new Date("2026-10-27T12:00:00.000Z");
const POLL_INTERVAL_MS = 5_000;
const seconds = (n: number) => n * 1000;

let task: ReturnType<typeof switchableProvider>;

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  resetVideoStageStartDelayMs();
  setVideoPollIntervalMs(POLL_INTERVAL_MS);
  resetVideoDownloadFetch();
  task = switchableProvider();
  setVideoProviderRegistry({ defaultIdentifier: STUB_VIDEO_PROVIDER_NAME, adapters: { [STUB_VIDEO_PROVIDER_NAME]: task.provider } });
  vi.useFakeTimers();
  vi.setSystemTime(BOOT);
});

afterEach(() => {
  resetAssemblyTool();
  vi.useRealTimers();
  resetVideoPollIntervalMs();
  resetVideoProviderRegistry();
});

/** A scene whose clip task `task-old` was sent `sentSecondsBeforeBoot` before the boot (or never recorded), still unfinished. */
function clipSentBeforeBoot(sentSecondsBeforeBoot: number | null): string {
  const runId = randomUUID();
  createRun(runId, "restart ceiling", "A quiet harbor at dusk.", "en");
  const sceneId = randomUUID();
  const sentAt = sentSecondsBeforeBoot === null ? null : new Date(BOOT.getTime() - seconds(sentSecondsBeforeBoot)).toISOString();
  db.prepare(
    `INSERT INTO scenes (id, run_id, idx, status, attempts, current_request_id, video_provider, requested_duration_seconds, video_request_sent_at, updated_at)
     VALUES (?, ?, 0, 'video-generating', 1, 'task-old', ?, 8, ?, ?)`,
  ).run(sceneId, runId, STUB_VIDEO_PROVIDER_NAME, sentAt, BOOT.toISOString());
  return sceneId;
}

describe("a restart while a clip is past its limit", () => {
  it("resumes the same task with no new submit, and fails 2400 s after the original send, not after the boot (AC4)", async () => {
    const sceneId = clipSentBeforeBoot(1300);

    simulateRestart();
    await vi.advanceTimersByTimeAsync(0);

    expect([...task.polled]).toEqual(["task-old"]);
    expect(task.submits()).toBe(0);
    expect(getScene(sceneId)!.status).toBe("video-generating");

    await vi.advanceTimersByTimeAsync(seconds(1090)); // 2390 s after the original send: still inside the ceiling
    expect(getScene(sceneId)!.status).toBe("video-generating");

    await vi.advanceTimersByTimeAsync(seconds(20)); // 2410 s after the original send
    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("failed");
    expect(scene.lastError).toContain("2400 s");
    expect(task.submits()).toBe(0);
  });

  it("accepts a clip that finished while the application was down, even past the ceiling", async () => {
    setAssemblyTool(createStubAssemblyTool({ kind: "slow-success", delayMs: 10_000 }));
    const sceneId = clipSentBeforeBoot(3000);
    task.byTask.set("task-old", { kind: "success", clip: { source: "bytes", bytes: MP4_BYTES } });

    simulateRestart();
    await vi.advanceTimersByTimeAsync(0);

    expect(getScene(sceneId)!.status).toBe("chunk-complete");
    expect(task.submits()).toBe(0);
  });

  it("fails at the first poll a clip that is still pending after the ceiling", async () => {
    const sceneId = clipSentBeforeBoot(3000);

    simulateRestart();
    await vi.advanceTimersByTimeAsync(0);

    expect(getScene(sceneId)!.status).toBe("failed");
    expect(task.submits()).toBe(0);
  });

  it("counts from the boot when no send time was stored", async () => {
    const sceneId = clipSentBeforeBoot(null);

    simulateRestart();
    await vi.advanceTimersByTimeAsync(seconds(2300));
    expect(getScene(sceneId)!.status).toBe("video-generating");

    await vi.advanceTimersByTimeAsync(seconds(110));
    expect(getScene(sceneId)!.status).toBe("failed");
  });
});
