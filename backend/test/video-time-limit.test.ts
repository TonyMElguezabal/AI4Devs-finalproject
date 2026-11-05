import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { phaseTimeoutMs, videoTaskCeilingMs } from "../src/config/providers.ts";
import { limitSeconds } from "./phaseLimit.ts";
import {
  commitSceneResult,
  createRun,
  db,
  getRun,
  getScene,
  getScenesForRun,
  markImageComplete,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  launchVideoStageForRun,
  manualRetry,
  resetAssemblyTool,
  resetVideoPollIntervalMs,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
  setVideoPollIntervalMs,
  VIDEO_STAGE,
} from "../src/orchestrator.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import { MP4_BYTES, switchableProvider } from "./videoTaskFixtures.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
  STUB_VIDEO_PROVIDER_NAME,
} from "../src/videoProvider.ts";

// raise-video-time-limit (JOS-197), spec video-stage-time-limit — a clip request is given the configured maximum
// before it counts as timed out; one still generating inside it is neither failed nor retried.

// configure-providers-and-parameters (JOS-174): `phaseTimeoutMs` is wrapped so one test can make the video stage untimed.
vi.mock("../src/config/providers.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/providers.ts")>();
  return { ...actual, phaseTimeoutMs: vi.fn(actual.phaseTimeoutMs), videoTaskCeilingMs: vi.fn(actual.videoTaskCeilingMs) };
});

const PNG_1920_1088 = (() => {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1920, 16);
  buf.writeUInt32BE(1088, 20);
  return buf;
})();

const POLL_INTERVAL_MS = 5_000;

function useSwitchableProvider() {
  const switchable = switchableProvider();
  setVideoProviderRegistry({ defaultIdentifier: STUB_VIDEO_PROVIDER_NAME, adapters: { [STUB_VIDEO_PROVIDER_NAME]: switchable.provider } });
  return switchable;
}

const seconds = (n: number) => n * 1000;

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  resetVideoStageStartDelayMs();
  setVideoPollIntervalMs(POLL_INTERVAL_MS);
  resetVideoDownloadFetch();
  // "pending" never resolves: the provider keeps answering that the task is still being generated.
  setVideoProviderRegistry({
    defaultIdentifier: STUB_VIDEO_PROVIDER_NAME,
    adapters: { [STUB_VIDEO_PROVIDER_NAME]: createStubVideoProvider("pending") },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  resetAssemblyTool();
  vi.useRealTimers();
  resetVideoPollIntervalMs();
  resetVideoProviderRegistry();
});

async function sceneWithPendingClip(): Promise<string> {
  const runId = "00000000-0000-4000-8000-000000000197";
  createRun(runId, "Limit test", "A quiet harbor at dusk.", "en");
  const registered = await registerDecomposition(
    runId,
    [{ text: "A quiet harbor at dusk.", narrationInterval: { startSeconds: 0, endSeconds: 8 } }],
    { generate: async (texts) => ({ kind: "success", pairs: texts.map((_, i) => ({ image: `i${i}`, video: `v${i}` })) }) },
    8,
  );
  if (!registered.ok) throw new Error(`registration failed: ${registered.reason}`);
  const run = getRun(runId)!;
  const scene = getScenesForRun(runId)[0]!;
  const path = writeArtefactOnce(run.projectFolder, "scene-0.png", PNG_1920_1088);
  commitSceneResult(scene.id, path);
  markImageComplete(scene.id, path);
  launchVideoStageForRun(runId);
  await vi.advanceTimersByTimeAsync(0); // let the submit run; the first poll is armed
  return scene.id;
}

describe("the video stage's time limit", () => {
  it("is 1200 s", () => {
    expect(limitSeconds("video")).toBe(1200);
  });

  const failedRequests = (sceneId: string) =>
    db
      .prepare("SELECT latency_ms AS latencyMs FROM provider_requests WHERE scene_id = ? AND stage = 'video' AND mode = 'transient_failure'")
      .all(sceneId) as Array<{ latencyMs: number }>;

  it("leaves a 14 s clip that is still generating after 640 s pending, with no failure and no new request", async () => {
    const sceneId = await sceneWithPendingClip();

    await vi.advanceTimersByTimeAsync(640_000);

    expect(getScene(sceneId)!.status).toBe("video-generating");
    expect(getScene(sceneId)!.attempts).toBe(1);
    expect(failedRequests(sceneId)).toHaveLength(0);
  });

  it("never fails a clip that is still generating when the video stage has no maximum time", async () => {
    vi.mocked(phaseTimeoutMs).mockReturnValue(undefined);
    vi.mocked(videoTaskCeilingMs).mockReturnValue(undefined);
    try {
      const sceneId = await sceneWithPendingClip();

      await vi.advanceTimersByTimeAsync(3_000_000); // fifty minutes, well past the shipped 1200 s

      expect(getScene(sceneId)!.status).toBe("video-generating");
      expect(getScene(sceneId)!.attempts).toBe(1);
      expect(failedRequests(sceneId)).toHaveLength(0);
    } finally {
      vi.mocked(phaseTimeoutMs).mockReset();
      vi.mocked(videoTaskCeilingMs).mockReset();
    }
  });

  // keep-clip-task-on-timeout (JOS-204), spec video-stage-time-limit — past the limit the one provider task keeps being followed.
  const failedRequestsOfAnyKind = (sceneId: string) =>
    db.prepare("SELECT mode FROM provider_requests WHERE scene_id = ? AND stage = 'video' AND mode <> 'success'").all(sceneId) as Array<{ mode: string }>;

  it("keeps following the same task past the limit: no failure, no new task, the slot stays held (AC1)", async () => {
    const task = useSwitchableProvider();
    const sceneId = await sceneWithPendingClip();

    await vi.advanceTimersByTimeAsync(seconds(1300));

    expect(getScene(sceneId)!.status).toBe("video-generating");
    expect(getScene(sceneId)!.attempts).toBe(1);
    expect(task.submits()).toBe(1);
    expect([...task.polled]).toEqual(["task-1"]);
    expect(failedRequestsOfAnyKind(sceneId)).toHaveLength(0);
    expect(concurrency.stats(VIDEO_STAGE).inFlight).toBe(1);
  });

  it("accepts a clip that arrives after the limit, with one attempt and one task (AC2)", async () => {
    setAssemblyTool(createStubAssemblyTool({ kind: "slow-success", delayMs: 10_000 }));
    const task = useSwitchableProvider();
    const sceneId = await sceneWithPendingClip();
    await vi.advanceTimersByTimeAsync(seconds(1300));

    task.answer.current = { kind: "success", clip: { source: "bytes", bytes: MP4_BYTES } };
    await vi.advanceTimersByTimeAsync(seconds(250));

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("chunk-complete");
    expect(scene.attempts).toBe(1);
    expect(task.submits()).toBe(1);
    expect(failedRequestsOfAnyKind(sceneId)).toHaveLength(0);
  });

  for (const [name, answer] of [
    ["failed", { kind: "failed_transient", reason: "the video task ended in FAILED" }],
    ["no longer held", { kind: "not_found" }],
  ] as const) {
    it(`records a task the provider reports as ${name} past the limit and lets the retry rule send a new task (AC3)`, async () => {
      const task = useSwitchableProvider();
      const sceneId = await sceneWithPendingClip();
      await vi.advanceTimersByTimeAsync(seconds(1300));

      task.byTask.set("task-1", answer); // only the first task; the one the retry sends stays pending
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(failedRequests(sceneId)).toHaveLength(1);
      expect(task.submits()).toBe(2);
      expect(getScene(sceneId)!.attempts).toBe(2);
    });
  }

  it("fails the scene as not retryable at twice the limit, naming the ceiling and sending no new task", async () => {
    const task = useSwitchableProvider();
    const sceneId = await sceneWithPendingClip();

    await vi.advanceTimersByTimeAsync(seconds(2400) + POLL_INTERVAL_MS);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("failed");
    expect(scene.lastError).toContain("2400 s");
    expect(scene.lastError).toContain("may still be running");
    expect(task.submits()).toBe(1);
    expect(failedRequestsOfAnyKind(sceneId)).toEqual([{ mode: "not_retryable_failure" }]);
    expect(concurrency.stats(VIDEO_STAGE).inFlight).toBe(0);
  });

  it("sends a new task when the User retries a scene that failed at the ceiling", async () => {
    const task = useSwitchableProvider();
    const sceneId = await sceneWithPendingClip();
    await vi.advanceTimersByTimeAsync(seconds(2400) + POLL_INTERVAL_MS);
    expect(getScene(sceneId)!.status).toBe("failed");

    const outcome = manualRetry(getScene(sceneId)!.runId, sceneId);
    await vi.advanceTimersByTimeAsync(0);

    expect(outcome).toEqual({ ok: true });
    expect(task.submits()).toBe(2);
  });
});
