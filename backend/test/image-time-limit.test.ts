import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { PER_PHASE_MAX_TIME_SECONDS } from "../src/config/providers.ts";
import { createRun, getScene, resetAll } from "../src/db.ts";
import { createFalAiImageProvider, resetDownloadFetch, resetImageProviderRegistry, setDownloadFetch, setImageProviderRegistry } from "../src/imageProvider.ts";
import { launchImageStage, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { STAGE } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// stage-execution-time-limit (JOS-185), group 4 — the image stage records no attempt row, so its
// limit is applied where the request is made: the Fal.ai adapter stops waiting at the stage's
// maximum time, measured from the call (after the request-cap slot was taken).

const PROVIDER_ID = "fal-time-limit-test";
const KEY = () => "test-key";

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

const answersPromptly = (async () => new Response(JSON.stringify({ images: [{ url: "https://fal.media/x.png" }] }), { status: 200 })) as unknown as typeof fetch;

/** A provider call that never answers, and rejects the way fetch does when its signal aborts. */
const neverAnswers = ((_url: unknown, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  })) as unknown as typeof fetch;

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

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 1);
  setVideoStageStartDelayMs(9_999_999); // keep the video stage out of these tests
  resetImageProviderRegistry();
  setDownloadFetch((async () => new Response(new Uint8Array(buildPng(1920, 1088)), { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetVideoStageStartDelayMs();
  resetDownloadFetch();
  resetImageProviderRegistry();
});

describe("the Fal.ai adapter's limit", () => {
  it("defaults to the image stage's maximum time", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await createFalAiImageProvider({ fetchFn: answersPromptly, loadKey: KEY }).generate("a lighthouse");

    expect(timeout).toHaveBeenCalledWith(PER_PHASE_MAX_TIME_SECONDS.image * 1000);
  });

  it("still takes an explicit limit", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await createFalAiImageProvider({ fetchFn: answersPromptly, loadKey: KEY, timeoutMs: 1234 }).generate("a lighthouse");

    expect(timeout).toHaveBeenCalledWith(1234);
  });
});

describe("an image request that never answers", () => {
  it("is abandoned at the limit as a transient failure, and the scene's own retry path decides what is next", async () => {
    const sceneId = await registeredScene();
    concurrency.setLimit(STAGE, 10);
    setImageProviderRegistry({ defaultIdentifier: PROVIDER_ID, adapters: { [PROVIDER_ID]: createFalAiImageProvider({ fetchFn: neverAnswers, loadKey: KEY, timeoutMs: 20 }) } });

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "failed");

    const scene = getScene(sceneId)!;
    expect(scene.attempts).toBe(4); // the same bounded budget: 1 + 3 retries
    expect(scene.lastError).toMatch(/time limit/);
  });
});

describe("a scene that waited behind the request limit", () => {
  it("is not timed out for the waiting: its clock starts when the request is made", async () => {
    const sceneId = await registeredScene();
    setImageProviderRegistry({ defaultIdentifier: PROVIDER_ID, adapters: { [PROVIDER_ID]: createFalAiImageProvider({ fetchFn: answersPromptly, loadKey: KEY, timeoutMs: 40 }) } });
    concurrency.acquire(STAGE, "another-scene", () => {}); // the only slot is taken

    launchImageStage(sceneId);
    expect(concurrency.stats(STAGE).queued).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120)); // waits three times the limit
    expect(getScene(sceneId)!.attempts).toBe(0); // nothing was sent, so nothing counts

    concurrency.release(STAGE, "another-scene");
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(getScene(sceneId)!.attempts).toBe(1); // a single attempt, no timeout
  });
});
