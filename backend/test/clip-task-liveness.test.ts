import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { videoTaskCeilingMs } from "../src/config/providers.ts";
import { createRun, db, getScene, resetAll } from "../src/db.ts";
import { events, resetAssemblyTool, resetVideoPollIntervalMs, resetVideoStageStartDelayMs, setVideoPollIntervalMs } from "../src/orchestrator.ts";
import { recordTaskCheck, resetTaskChecksForTests, videoRequestView } from "../src/videoRequestStatus.ts";
import { resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry, STUB_VIDEO_PROVIDER_NAME } from "../src/videoProvider.ts";
import type { SessionSnapshot } from "../src/types.ts";
import { simulateRestart } from "./restartHelpers.ts";
import { switchableProvider } from "./videoTaskFixtures.ts";

// show-clip-task-liveness (JOS-233), spec video-request-status "The clip request shows the provider task and when it was
// last checked" — the task id, the last "still running" answer and the instant the wait ends.

vi.mock("../src/config/providers.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/providers.ts")>();
  return { ...actual, videoTaskCeilingMs: vi.fn(actual.videoTaskCeilingMs) };
});

const BOOT = new Date("2026-10-27T22:50:00.000Z");
const POLL_INTERVAL_MS = 10_000;
const BODY = JSON.stringify({ prompt: "video 1", duration: 8, resolution: "2K", firstFrame: "scene 1 image" });

let task: ReturnType<typeof switchableProvider>;

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  resetTaskChecksForTests();
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
  vi.mocked(videoTaskCeilingMs).mockReset();
});

/** A scene whose clip task `taskId` was sent at `sentAt` and is still unfinished, as the store has it after the submit returned. */
function clipInFlight(taskId = "task-abc", sentAt = "2026-10-27T22:43:08.000Z"): string {
  const runId = randomUUID();
  createRun(runId, "liveness", "A quiet harbor at dusk.", "en");
  const sceneId = randomUUID();
  db.prepare(
    `INSERT INTO scenes (id, run_id, idx, status, attempts, current_request_id, video_provider, requested_duration_seconds, video_request_sent_at, video_request, updated_at)
     VALUES (?, ?, 1, 'video-generating', 1, ?, ?, 8, ?, ?, ?)`,
  ).run(sceneId, runId, taskId, STUB_VIDEO_PROVIDER_NAME, sentAt, BODY, BOOT.toISOString());
  return sceneId;
}

const viewOf = (sceneId: string) => videoRequestView(getScene(sceneId)!);

describe("the clip request view", () => {
  it("carries the provider's task id", () => {
    expect(viewOf(clipInFlight("task-abc"))?.taskId).toBe("task-abc");
  });

  it("has no last check until one is recorded, then carries it", () => {
    const sceneId = clipInFlight("task-abc");
    expect(viewOf(sceneId)?.lastCheckedAt).toBeNull();

    recordTaskCheck(sceneId, "task-abc", "2026-10-27T22:50:42.000Z");

    expect(viewOf(sceneId)?.lastCheckedAt).toBe("2026-10-27T22:50:42.000Z");
  });

  it("does not show a check of another task: a retry starts with none", () => {
    const sceneId = clipInFlight("task-first");
    recordTaskCheck(sceneId, "task-first", "2026-10-27T22:50:42.000Z");

    db.prepare("UPDATE scenes SET current_request_id = 'task-second' WHERE id = ?").run(sceneId);

    expect(viewOf(sceneId)).toMatchObject({ taskId: "task-second", lastCheckedAt: null });
  });

  it("ends the wait at the send time plus the clip wait ceiling", () => {
    const view = viewOf(clipInFlight("task-abc", "2026-10-27T22:43:08.000Z"));

    expect(view?.waitEndsAt).toBe("2026-10-27T23:23:08.000Z"); // 2400 s after the send
  });

  it("has no end to the wait when the video stage has no time limit", () => {
    vi.mocked(videoTaskCeilingMs).mockReturnValue(undefined);

    expect(viewOf(clipInFlight())?.waitEndsAt).toBeNull();
  });

  it("is absent once the scene is no longer generating", () => {
    const sceneId = clipInFlight();
    db.prepare("UPDATE scenes SET status = 'failed' WHERE id = ?").run(sceneId);

    expect(viewOf(sceneId)).toBeUndefined();
  });
});

describe("a clip being followed", () => {
  function collectSnapshots(): { snapshots: SessionSnapshot[]; stop: () => void } {
    const snapshots: SessionSnapshot[] = [];
    const listener = (snapshot: SessionSnapshot) => snapshots.push(snapshot);
    events.on("state", listener);
    return { snapshots, stop: () => events.off("state", listener) };
  }

  const lastChecked = (snapshot: SessionSnapshot | undefined) => snapshot?.scenes[0]?.videoRequest?.lastCheckedAt;

  it("records each 'still running' answer and publishes a snapshot with it", async () => {
    const sceneId = clipInFlight("task-abc");
    const { snapshots, stop } = collectSnapshots();

    simulateRestart();
    await vi.advanceTimersByTimeAsync(0);
    const first = snapshots.at(-1);

    expect(lastChecked(first)).toBe(BOOT.toISOString());
    expect(first?.scenes[0]?.videoRequest?.taskId).toBe("task-abc");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    const second = snapshots.at(-1);

    expect(snapshots.length).toBeGreaterThan(1);
    expect(lastChecked(second)).toBe(new Date(BOOT.getTime() + POLL_INTERVAL_MS).toISOString());
    expect(getScene(sceneId)!.status).toBe("video-generating");
    stop();
  });

  it("shows the stored task and no check after a restart, until the first poll answers", () => {
    const sceneId = clipInFlight("task-abc");
    recordTaskCheck(sceneId, "task-abc", "2026-10-27T22:49:00.000Z"); // the process before the restart

    simulateRestart(); // a new process starts with no record of checks

    expect(viewOf(sceneId)).toMatchObject({ taskId: "task-abc", lastCheckedAt: null });
  });
});
