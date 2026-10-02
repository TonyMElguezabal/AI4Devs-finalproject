import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { createRun, db, getScene, getScenesForRun, resetAll } from "../src/db.ts";
import { createStubImageProvider, resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { correctAndRetry, launchImageStage, launchScene, manualRetry, RETRY_BUDGET } from "../src/orchestrator.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import { STAGE } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { contiguousFragments, voiceOverDurationOf } from "./fragmentFixtures.ts";

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47; // PNG signature
  buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a;
  buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 0x0d; // IHDR length
  buf[12] = 0x49; buf[13] = 0x48; buf[14] = 0x44; buf[15] = 0x52; // IHDR
  buf[16] = (width >> 24) & 0xff; buf[17] = (width >> 16) & 0xff;
  buf[18] = (width >> 8) & 0xff; buf[19] = width & 0xff;
  buf[20] = (height >> 24) & 0xff; buf[21] = (height >> 16) & 0xff;
  buf[22] = (height >> 8) & 0xff; buf[23] = height & 0xff;
  buf[24] = 8; buf[25] = 2; // bit depth / color type
  return buf;
}
const ACCEPTED_PNG = buildPng(1920, 1088);
const STUB_PROVIDER_ID = "stub-test";

// assign-narration-intervals (JOS-143), group 5 — design Decision 6, AC4: no
// processing, retry or correction changes a chunk's interval. These pass by
// construction (no retry code touches the interval columns); they pin it.

const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
const FRAGMENTS = contiguousFragments([
  { text: "The harbor is quiet at dusk.", seconds: 6 },
  { text: "Fishing boats return with the tide.", seconds: 9.5 },
]);
const REGISTERED_INTERVALS = [
  { startSeconds: 0, endSeconds: 6 },
  { startSeconds: 6, endSeconds: 15.5 },
];

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 5);
    };
    tick();
  });
}

async function registeredSession(): Promise<{ runId: string; sceneId: string }> {
  const runId = randomUUID();
  createRun(runId, "Immutability test", SCRIPT, "en");
  const result = await registerDecomposition(runId, FRAGMENTS, generator, voiceOverDurationOf(FRAGMENTS));
  if (!result.ok) throw new Error("registration failed in the test setup");
  return { runId, sceneId: result.sceneIds[0]! };
}

const intervalsOf = (runId: string) => getScenesForRun(runId).map((scene) => scene.narrationInterval);

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  resetImageProviderRegistry();
});

describe("A chunk's interval survives processing and retries (AC4)", () => {
  it("is unchanged after the stage completes", async () => {
    const { runId, sceneId } = await registeredSession();

    setImageProviderRegistry({ defaultIdentifier: STUB_PROVIDER_ID, adapters: { [STUB_PROVIDER_ID]: createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }) } });
    launchImageStage(sceneId); // image path (scene has imageInstruction)
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);
  });

  it("is unchanged after a failure, its automatic retries, a manual retry and a corrected instruction", async () => {
    const { runId, sceneId } = await registeredSession();
    // Failure cycle: all attempts via image path (scene has imageInstruction)
    setImageProviderRegistry({ defaultIdentifier: STUB_PROVIDER_ID, adapters: { [STUB_PROVIDER_ID]: createStubImageProvider("transient-failure") } });

    launchImageStage(sceneId); // image path — exhausts retry budget
    await waitFor(() => getScene(sceneId)?.status === "failed", 5000);
    expect(getScene(sceneId)?.attempts).toBe(1 + RETRY_BUDGET);
    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);

    // manualRetry dispatches to launchImageStage; adapter still set to transient-failure
    expect(manualRetry(sceneId).ok).toBe(true);
    await waitFor(() => getScene(sceneId)?.status === "failed", 5000);
    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);

    // correctAndRetry with a success adapter
    setImageProviderRegistry({ defaultIdentifier: STUB_PROVIDER_ID, adapters: { [STUB_PROVIDER_ID]: createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }) } });
    expect(correctAndRetry(sceneId, "a corrected image instruction").ok).toBe(true);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");
    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);
  });
});

describe("A second decomposition does not replace the intervals (AC4)", () => {
  it("is refused as already registered and leaves the stored intervals unchanged", async () => {
    const { runId } = await registeredSession();
    const other = contiguousFragments([
      { text: "The harbor is quiet at dusk.", seconds: 8 },
      { text: "Fishing boats return with the tide.", seconds: 8 },
    ]);

    const result = await registerDecomposition(runId, other, generator, voiceOverDurationOf(other));

    expect(result).toEqual({ ok: false, reason: "already-registered" });
    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);
  });
});
