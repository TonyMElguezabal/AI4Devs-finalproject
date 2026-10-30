import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { createRun, getScene, resetAll } from "../src/db.ts";
import {
  resetDownloadFetch,
  resetImageProviderRegistry,
  setDownloadFetch,
  setImageProviderRegistry,
  type ImageProvider,
  type ImageSubmitResult,
} from "../src/imageProvider.ts";
import { continueSession, launchImageStage, pauseSession, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { setRetryDelayConfig } from "../src/retry/stageAttemptRecorder.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { STAGE } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// follow-fal-image-queue (JOS-239), spec chunk-image-generation — an automatic image retry is sent only after the retry
// delay of the bounded retry policy (never at once), at least as long as the provider's own Retry-After, and a pause
// during the wait sends nothing.

const PROVIDER_ID = "image-retry-delay-test";

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

/** Answers the submissions in order (the last answer repeats); a submitted request is complete at its first status check. */
function scriptedProvider(answers: ImageSubmitResult[]) {
  const submittedAt: number[] = [];
  const provider: ImageProvider = {
    async submit() {
      submittedAt.push(Date.now());
      return answers[Math.min(submittedAt.length, answers.length) - 1]!;
    },
    async poll() {
      return { kind: "success", image: { source: "bytes", bytes: buildPng(1920, 1088), contentType: "image/png" } };
    },
    async cancel() {
      return "cancelled";
    },
  };
  return { provider, submittedAt };
}

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

async function registeredScene(): Promise<{ sceneId: string; runId: string }> {
  const runId = randomUUID();
  createRun(runId, "Image retry delay", "The lighthouse stands alone.", "en");
  const fragments: SegmentedFragment[] = [{ text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 6 } }];
  const result = await registerDecomposition(runId, fragments, stubGenerator, 6);
  if (!result.ok) throw new Error("fixture registration failed");
  return { sceneId: result.sceneIds[0]!, runId };
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  setVideoStageStartDelayMs(9_999_999); // keep the video stage out of these tests
  resetImageProviderRegistry();
  setDownloadFetch(async () => new Response(new Uint8Array(buildPng(1920, 1088)), { status: 200, headers: { "content-type": "image/png" } }));
  setRetryDelayConfig({ baseSeconds: 0.15, capSeconds: 1 }); // the test setup resets it before each test
});

afterEach(() => {
  resetVideoStageStartDelayMs();
  resetDownloadFetch();
  resetImageProviderRegistry();
});

function useProvider(provider: ImageProvider): void {
  setImageProviderRegistry({ defaultIdentifier: PROVIDER_ID, adapters: { [PROVIDER_ID]: provider } });
}

describe("an automatic image retry", () => {
  it("is not sent at once: the next submission waits the retry delay, and counts as the next attempt", async () => {
    const { sceneId } = await registeredScene();
    const { provider, submittedAt } = scriptedProvider([TRANSIENT, SUBMITTED]);
    useProvider(provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(submittedAt).toHaveLength(2);
    expect(submittedAt[1]! - submittedAt[0]!).toBeGreaterThanOrEqual(140); // the base delay, 150 ms
    expect(getScene(sceneId)!.attempts).toBe(2);
  });

  it("waits longer after each failure of the cycle (the delay doubles up to the cap)", async () => {
    const { sceneId } = await registeredScene();
    const { provider, submittedAt } = scriptedProvider([TRANSIENT, TRANSIENT, SUBMITTED]);
    useProvider(provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(submittedAt).toHaveLength(3);
    expect(submittedAt[1]! - submittedAt[0]!).toBeGreaterThanOrEqual(140); // 150 ms
    expect(submittedAt[2]! - submittedAt[1]!).toBeGreaterThanOrEqual(290); // 300 ms
  });

  it("waits at least as long as the provider asked, when it answered HTTP 429 with Retry-After", async () => {
    const { sceneId } = await registeredScene();
    const { provider, submittedAt } = scriptedProvider([{ ...TRANSIENT, retryAfterSeconds: 0.4 }, SUBMITTED]);
    useProvider(provider);

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(submittedAt[1]! - submittedAt[0]!).toBeGreaterThanOrEqual(390); // longer than the base delay of 150 ms
  });

  it("sends nothing while the session is paused, and is sent once the session continues", async () => {
    const { sceneId, runId } = await registeredScene();
    const { provider, submittedAt } = scriptedProvider([TRANSIENT, SUBMITTED]);
    useProvider(provider);

    launchImageStage(sceneId);
    await waitFor(() => submittedAt.length === 1);
    pauseSession(runId); // during the wait for the retry
    await sleep(400); // well past the delay
    expect(submittedAt).toHaveLength(1);
    expect(getScene(sceneId)!.status).toBe("submitted");

    continueSession(runId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(submittedAt).toHaveLength(2);
  });
});
