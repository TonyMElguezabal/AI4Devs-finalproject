import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { IMAGE_QUEUE_START_WINDOW_SECONDS, imageRequestBoundMs, imageTaskCeilingMs } from "../src/config/providers.ts";
import { limitSeconds } from "./phaseLimit.ts";
import { createRun, db, getScene, resetAll } from "../src/db.ts";
import {
  resetDownloadFetch,
  resetImageProviderRegistry,
  setDownloadFetch,
  setImageProviderRegistry,
  type ImageCancelResult,
  type ImageHandle,
  type ImagePollResult,
  type ImageProvider,
} from "../src/imageProvider.ts";
import { launchImageStage, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { STAGE } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { markImageSweepDone } from "./imageProviderFixtures.ts";

// follow-fal-image-queue (JOS-239), spec stage-execution-time-limit — an image request is followed from the moment the
// provider starts it: queue time is not execution time, a request past the limit keeps being followed up to twice the
// limit (cancelled there), and a request whose status checks stop answering is bounded from its submission.

// The ceilings are wrapped so a test can shrink them to milliseconds; `mockReset` puts the real ones back.
vi.mock("../src/config/providers.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/providers.ts")>();
  return { ...actual, imageTaskCeilingMs: vi.fn(actual.imageTaskCeilingMs), imageRequestBoundMs: vi.fn(actual.imageRequestBoundMs) };
});

const PROVIDER_ID = "image-time-limit-test";

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const SUCCESS: ImagePollResult = { kind: "success", image: { source: "bytes", bytes: buildPng(1920, 1088), contentType: "image/png" } };

const stubGenerator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

/** A provider the test steers: what the next status check answers, and what a cancel answers. */
function controlledProvider() {
  let answer: ImagePollResult | (() => ImagePollResult) = { kind: "queued" };
  let cancelAnswer: ImageCancelResult = "cancelled";
  const submits: string[] = [];
  const cancels: ImageHandle[] = [];
  const handle: ImageHandle = {
    requestId: "request-1",
    statusUrl: "https://queue.fal.run/x/requests/request-1/status",
    responseUrl: "https://queue.fal.run/x/requests/request-1",
    cancelUrl: "https://queue.fal.run/x/requests/request-1/cancel",
  };
  const provider: ImageProvider = {
     
    async submit(instruction) {
      submits.push(instruction);
      return { kind: "submitted", handle };
    },
     
    async poll() {
      return typeof answer === "function" ? answer() : answer;
    },
     
    async cancel(h) {
      cancels.push(h);
      return cancelAnswer;
    },
  };
  return {
    provider,
    submits,
    cancels,
    answer: (next: ImagePollResult | (() => ImagePollResult)) => {
      answer = next;
    },
    cancelAnswer: (next: ImageCancelResult) => {
      cancelAnswer = next;
    },
  };
}

async function registeredScene(): Promise<string> {
  const runId = randomUUID();
  createRun(runId, "Image time limit", "The lighthouse stands alone.", "en");
  const fragments: SegmentedFragment[] = [{ text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 6 } }];
  const result = await registerDecomposition(runId, fragments, stubGenerator, 6);
  if (!result.ok) throw new Error("fixture registration failed");
  return result.sceneIds[0]!;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function useProvider(provider: ImageProvider): void {
  setImageProviderRegistry({ defaultIdentifier: PROVIDER_ID, adapters: { [PROVIDER_ID]: provider } });
}

const requestRows = (sceneId: string) =>
  db.prepare("SELECT mode, attempt_number FROM provider_requests WHERE scene_id = ? AND stage = 'image' ORDER BY attempt_number").all(sceneId) as unknown as Array<{
    mode: string;
    attempt_number: number;
  }>;

beforeEach(() => {
  vi.mocked(imageTaskCeilingMs).mockReset();
  vi.mocked(imageRequestBoundMs).mockReset();
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 1);
  setVideoStageStartDelayMs(9_999_999); // keep the video stage out of these tests
  resetImageProviderRegistry();
  setDownloadFetch(async () => new Response(new Uint8Array(buildPng(1920, 1088)), { status: 200, headers: { "content-type": "image/png" } }));
});

afterEach(() => {
  resetVideoStageStartDelayMs();
  resetDownloadFetch();
  resetImageProviderRegistry();
});

describe("the image ceilings", () => {
  it("are twice the image limit after the provider started the request, and the queue start window more from the submission", async () => {
    const actual = await vi.importActual<typeof import("../src/config/providers.ts")>("../src/config/providers.ts");

    expect(actual.imageTaskCeilingMs()).toBe(2 * limitSeconds("image") * 1000);
    expect(actual.imageRequestBoundMs()).toBe(IMAGE_QUEUE_START_WINDOW_SECONDS * 1000 + 2 * limitSeconds("image") * 1000);
  });
});

describe("an image request that waits in the provider's queue", () => {
  it("is not timed for the wait: it succeeds on the first attempt however long it queued, with one submission and no cancel", async () => {
    vi.mocked(imageTaskCeilingMs).mockReturnValue(100); // the limit is 50 ms; the queue wait below is four times the ceiling
    vi.mocked(imageRequestBoundMs).mockReturnValue(60_000);
    const sceneId = await registeredScene();
    const controlled = controlledProvider();
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await sleep(400);
    expect(getScene(sceneId)!.status).toBe("image-generating");
    controlled.answer({ kind: "in-progress" });
    await sleep(20);
    controlled.answer(SUCCESS);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(getScene(sceneId)!.attempts).toBe(1);
    expect(controlled.submits).toHaveLength(1);
    expect(controlled.cancels).toHaveLength(0);
    expect(requestRows(sceneId)).toEqual([{ mode: "success", attempt_number: 1 }]);
  });

  it("holds its request slot until it ends", async () => {
    const sceneId = await registeredScene();
    const controlled = controlledProvider();
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-generating");
    await sleep(30);
    expect(concurrency.stats(STAGE).inFlight).toBe(1);

    controlled.answer(SUCCESS);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");
    expect(concurrency.stats(STAGE).inFlight).toBe(0);
  });
});

describe("an image request that runs past the limit", () => {
  it("is still followed, and its image is accepted, when it completes before the ceiling", async () => {
    vi.mocked(imageTaskCeilingMs).mockReturnValue(600); // the limit is 300 ms
    vi.mocked(imageRequestBoundMs).mockReturnValue(60_000);
    const sceneId = await registeredScene();
    const controlled = controlledProvider();
    controlled.answer({ kind: "in-progress" });
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await sleep(400); // past the limit, before the ceiling
    expect(getScene(sceneId)!.status).toBe("image-generating");
    controlled.answer(SUCCESS);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(getScene(sceneId)!.attempts).toBe(1);
    expect(controlled.submits).toHaveLength(1);
    expect(controlled.cancels).toHaveLength(0);
  });

  it("is cancelled once at the ceiling and the scene fails with no retry in that cycle", async () => {
    vi.mocked(imageTaskCeilingMs).mockReturnValue(100);
    vi.mocked(imageRequestBoundMs).mockReturnValue(60_000);
    const sceneId = await registeredScene();
    markImageSweepDone(getScene(sceneId)!.runId); // the end-of-session sweep (image-sweep.test.ts) would resend a failed scene once
    const controlled = controlledProvider();
    controlled.answer({ kind: "in-progress" });
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "failed");
    await sleep(60); // a retry, if one were scheduled, would show here

    const scene = getScene(sceneId)!;
    expect(scene.lastError).toBe("the image request did not finish within 0.1 s (twice the 0.05 s limit); the provider may still finish and bill it");
    expect(scene.attempts).toBe(1);
    expect(controlled.submits).toHaveLength(1);
    expect(controlled.cancels).toHaveLength(1);
    expect(requestRows(sceneId)).toEqual([{ mode: "transient_failure", attempt_number: 1 }]);
    expect(concurrency.stats(STAGE).inFlight).toBe(0);
  });

  it("is accepted when the provider says, at the cancel, that it had just completed", async () => {
    vi.mocked(imageTaskCeilingMs).mockReturnValue(100);
    vi.mocked(imageRequestBoundMs).mockReturnValue(60_000);
    const sceneId = await registeredScene();
    const controlled = controlledProvider();
    controlled.answer({ kind: "in-progress" });
    controlled.cancelAnswer("already-completed");
    controlled.provider.cancel = async (h) => {
      controlled.cancels.push(h);
      controlled.answer(SUCCESS); // the result is there when the system asks once more
      return "already-completed";
    };
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(controlled.cancels).toHaveLength(1);
    expect(controlled.submits).toHaveLength(1);
    expect(requestRows(sceneId)).toEqual([{ mode: "success", attempt_number: 1 }]);
  });

  it("is never timed when the image stage has no maximum time", async () => {
    vi.mocked(imageTaskCeilingMs).mockReturnValue(undefined);
    vi.mocked(imageRequestBoundMs).mockReturnValue(undefined);
    const sceneId = await registeredScene();
    const controlled = controlledProvider();
    controlled.answer({ kind: "in-progress" });
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await sleep(300);
    expect(getScene(sceneId)!.status).toBe("image-generating");
    controlled.answer(SUCCESS);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(controlled.cancels).toHaveLength(0);
  });
});

describe("status checks that fail", () => {
  it("use up no attempt: the request is followed until it completes", async () => {
    const sceneId = await registeredScene();
    const controlled = controlledProvider();
    let checks = 0;
    controlled.answer(() => (++checks < 5 ? { kind: "check-failed" } : SUCCESS));
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(getScene(sceneId)!.attempts).toBe(1);
    expect(controlled.submits).toHaveLength(1);
  });

  it("end at the bound from the submission when they never answer: one cancel, then the scene fails", async () => {
    vi.mocked(imageTaskCeilingMs).mockReturnValue(1_000);
    vi.mocked(imageRequestBoundMs).mockReturnValue(150);
    const sceneId = await registeredScene();
    markImageSweepDone(getScene(sceneId)!.runId); // the end-of-session sweep would resend a failed scene once
    const controlled = controlledProvider();
    controlled.answer({ kind: "check-failed" });
    useProvider(controlled.provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "failed");

    expect(controlled.cancels).toHaveLength(1);
    expect(controlled.submits).toHaveLength(1);
    expect(getScene(sceneId)!.lastError).toMatch(/did not finish within 1 s \(twice the 0\.5 s limit\)/);
  });
});

describe("a scene that waited behind the request limit", () => {
  it("is not timed out for the waiting: its request is only submitted once a slot is free", async () => {
    vi.mocked(imageTaskCeilingMs).mockReturnValue(80);
    const sceneId = await registeredScene();
    const controlled = controlledProvider();
    controlled.answer(SUCCESS);
    useProvider(controlled.provider);
    concurrency.acquire(STAGE, "another-scene", () => {}); // the only slot is taken

    launchImageStage(sceneId);
    expect(concurrency.stats(STAGE).queued).toBe(1);
    await sleep(240); // waits three times the ceiling
    expect(getScene(sceneId)!.attempts).toBe(0); // nothing was sent, so nothing counts
    expect(controlled.submits).toHaveLength(0);

    concurrency.release(STAGE, "another-scene");
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(getScene(sceneId)!.attempts).toBe(1);
  });
});
