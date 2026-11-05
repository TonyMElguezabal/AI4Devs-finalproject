import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  applyMigrationsTo,
  createRun,
  db,
  getScene,
  getScenesForRun,
  insertProviderRequest,
  markChunkComplete,
  markSceneFailed,
  resetAll,
} from "../src/db.ts";
import {
  resetDownloadFetch,
  resetImageProviderRegistry,
  setDownloadFetch,
  setImageProviderRegistry,
  type ImageProvider,
  type ImageSubmitResult,
} from "../src/imageProvider.ts";
import {
  broadcast,
  continueSession,
  events,
  launchImageStageForRun,
  pauseSession,
  recoverOnBoot,
  resetVideoStageStartDelayMs,
  setVideoStageStartDelayMs,
} from "../src/orchestrator.ts";
import { setRetryDelayConfig } from "../src/retry/stageAttemptRecorder.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { STAGE, type SessionSnapshot } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// follow-fal-image-queue (JOS-239), spec image-failure-recovery and scene-completion-gate — when a session's scene work
// goes idle, each image failure a retry can fix gets one new retry cycle, once per session, and the session is never
// published as failed while that sweep is due.

const PROVIDER_ID = "image-sweep-test";

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const stubGenerator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

const SUBMITTED: ImageSubmitResult = {
  kind: "submitted",
  handle: {
    requestId: "r",
    statusUrl: "https://queue.fal.run/x/requests/r/status",
    responseUrl: "https://queue.fal.run/x/requests/r",
    cancelUrl: "https://queue.fal.run/x/requests/r/cancel",
  },
};
const TRANSIENT: ImageSubmitResult = { kind: "failed_transient", reason: "stub: 503" };
const NOT_RETRYABLE: ImageSubmitResult = { kind: "failed_not_retryable", reason: "stub: the reference image was rejected" };

/** What a submission answers, by the scene's image instruction and how many times that instruction was submitted. */
function planned(plan: (instruction: string, nth: number) => ImageSubmitResult) {
  const submissions = new Map<string, number>();
  const provider: ImageProvider = {
    async submit(instruction) {
      const nth = (submissions.get(instruction) ?? 0) + 1;
      submissions.set(instruction, nth);
      return plan(instruction, nth);
    },
    async poll() {
      return { kind: "success", image: { source: "bytes", bytes: buildPng(1920, 1088), contentType: "image/png" } };
    },
    async cancel() {
      return "cancelled";
    },
  };
  return { provider, submissions };
}

async function registeredScenes(count: number): Promise<{ runId: string; sceneIds: string[] }> {
  const runId = randomUUID();
  const fragments: SegmentedFragment[] = Array.from({ length: count }, (_, i) => ({
    text: `Sentence ${i + 1}.`,
    narrationInterval: { startSeconds: i * 6, endSeconds: (i + 1) * 6 },
  }));
  createRun(runId, "Image sweep", fragments.map((f) => f.text).join(" "), "en");
  const result = await registerDecomposition(runId, fragments, stubGenerator, count * 6);
  if (!result.ok) throw new Error("fixture registration failed");
  return { runId, sceneIds: result.sceneIds };
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sweptAt = (runId: string) => (db.prepare("SELECT image_sweep_at AS at FROM runs WHERE id = ?").get(runId) as unknown as { at: string | null }).at;
const statuses = (runId: string) => getScenesForRun(runId).map((s) => s.status);

let published: string[];
const record = (snapshot: SessionSnapshot) => published.push(snapshot.session.state);

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  setVideoStageStartDelayMs(9_999_999); // keep the video stage out of these tests
  resetImageProviderRegistry();
  setDownloadFetch(async () => new Response(new Uint8Array(buildPng(1920, 1088)), { status: 200, headers: { "content-type": "image/png" } }));
  setRetryDelayConfig({ baseSeconds: 0, capSeconds: 0 }); // the test setup resets it before each test
  published = [];
  events.on("state", record);
});

afterEach(() => {
  events.off("state", record);
  resetVideoStageStartDelayMs();
  resetDownloadFetch();
  resetImageProviderRegistry();
});

function useProvider(provider: ImageProvider): void {
  setImageProviderRegistry({ defaultIdentifier: PROVIDER_ID, adapters: { [PROVIDER_ID]: provider } });
}

describe("the end-of-session image sweep", () => {
  it("retries a scene whose cycle was exhausted once the rest of the session is idle, and never publishes the session as failed meanwhile", async () => {
    const { runId, sceneIds } = await registeredScenes(3);
    // Scene 2 fails its whole first cycle (4 attempts); its next submission, the swept one, succeeds.
    const { provider, submissions } = planned((instruction, nth) => (instruction === "image 2" && nth <= 4 ? TRANSIENT : SUBMITTED));
    useProvider(provider);

    launchImageStageForRun(runId);
    await waitFor(() => getScene(sceneIds[1]!)!.status === "failed" && [0, 2].every((i) => getScene(sceneIds[i]!)!.status === "image-complete"));
    await sleep(40);
    expect(submissions.get("image 2")).toBe(4);
    expect(sweptAt(runId)).toBeNull(); // the other scenes' clips are still pending: the session is not idle yet

    for (const i of [0, 2]) markChunkComplete(sceneIds[i]!, `scene-${i + 1}.mp4`); // their clips finish
    broadcast(runId);
    await waitFor(() => getScene(sceneIds[1]!)!.status === "image-complete");

    expect(submissions.get("image 2")).toBe(5); // 4 attempts, then the one swept attempt
    expect(submissions.get("image 1")).toBe(1);
    expect(sweptAt(runId)).not.toBeNull();
    expect(getScene(sceneIds[1]!)!.attempts).toBe(1); // a new cycle, as after Retry scene
    expect(published).not.toContain("failed");
  });

  it("does not retry a failure a retry cannot fix, and the session fails with its failed scene", async () => {
    const { runId, sceneIds } = await registeredScenes(3);
    const { provider, submissions } = planned((instruction) => (instruction === "image 2" ? NOT_RETRYABLE : SUBMITTED));
    useProvider(provider);

    launchImageStageForRun(runId);
    await waitFor(() => getScene(sceneIds[1]!)!.status === "failed" && statuses(runId).filter((s) => s === "image-complete").length === 2);
    for (const i of [0, 2]) markChunkComplete(sceneIds[i]!, `scene-${i + 1}.mp4`); // their clips finish: the session is idle
    broadcast(runId);
    await sleep(60);

    expect(submissions.get("image 2")).toBe(1);
    expect(getScene(sceneIds[1]!)!.status).toBe("failed");
    expect(sweptAt(runId)).toBeNull(); // nothing was sweepable, so the sweep was not spent
    expect(published.at(-1)).toBe("failed");
  });

  it("runs only once: a scene that fails again after the sweep leaves the session failed, and a restart does not repeat it", async () => {
    const { runId, sceneIds } = await registeredScenes(2);
    const { provider, submissions } = planned((instruction) => (instruction === "image 2" ? TRANSIENT : SUBMITTED));
    useProvider(provider);

    launchImageStageForRun(runId);
    await waitFor(() => getScene(sceneIds[1]!)!.status === "failed" && getScene(sceneIds[0]!)!.status === "image-complete");
    markChunkComplete(sceneIds[0]!, "scene-1.mp4"); // the other scene's clip finishes: the session is idle
    broadcast(runId);
    await waitFor(() => (submissions.get("image 2") ?? 0) >= 8 && getScene(sceneIds[1]!)!.status === "failed");
    await sleep(60);

    expect(submissions.get("image 2")).toBe(8); // the first cycle of 4 attempts, and the swept cycle of 4
    expect(published.at(-1)).toBe("failed");
    const markedAt = sweptAt(runId);
    expect(markedAt).not.toBeNull();

    recoverOnBoot(); // the application restarts
    broadcast(runId);
    await sleep(60);

    expect(submissions.get("image 2")).toBe(8);
    expect(sweptAt(runId)).toBe(markedAt);
  });

  it("does not sweep a clip failure", async () => {
    const { runId, sceneIds } = await registeredScenes(1);
    const { provider, submissions } = planned(() => SUBMITTED);
    useProvider(provider);
    db.prepare("UPDATE scenes SET result = 'scene-1.png' WHERE id = ?").run(sceneIds[0]!); // its image is stored
    markSceneFailed(sceneIds[0]!, "the clip provider failed");

    broadcast(runId);
    await sleep(60);

    expect(getScene(sceneIds[0]!)!.status).toBe("failed");
    expect(submissions.size).toBe(0);
    expect(sweptAt(runId)).toBeNull();
  });

  it("waits while the session is paused, and sweeps once the session continues", async () => {
    const { runId, sceneIds } = await registeredScenes(1);
    const { provider, submissions } = planned(() => SUBMITTED);
    useProvider(provider);
    markSceneFailed(sceneIds[0]!, "the image provider answered HTTP 503 (retry budget exhausted after 4 attempts)");
    insertProviderRequest(randomUUID(), sceneIds[0]!, 100, "transient_failure", 4);
    pauseSession(runId);

    broadcast(runId);
    await sleep(60);
    expect(submissions.size).toBe(0);
    expect(sweptAt(runId)).toBeNull();

    continueSession(runId);
    await waitFor(() => getScene(sceneIds[0]!)!.status === "image-complete");

    expect(submissions.get("image 1")).toBe(1);
    expect(sweptAt(runId)).not.toBeNull();
  });
});

describe("migration 27", () => {
  it("marks a session that already had a failed scene as swept and leaves the others eligible", async () => {
    const failed = await registeredScenes(1);
    markSceneFailed(failed.sceneIds[0]!, "failed before the sweep existed");
    const healthy = await registeredScenes(1);

    db.exec("ALTER TABLE runs DROP COLUMN image_sweep_at");
    db.prepare("DELETE FROM schema_migrations WHERE version = 27").run();
    expect(applyMigrationsTo(db, 27)).toEqual([27]);

    expect(sweptAt(failed.runId)).not.toBeNull();
    expect(sweptAt(healthy.runId)).toBeNull();
  });
});
