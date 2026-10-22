import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { setActiveProvider } from "../src/activeProvider.ts";
import * as concurrency from "../src/concurrency.ts";
import { createRun, getScene, resetAll } from "../src/db.ts";
import { createStubImageProvider, resetDownloadFetch, setImageProviderRegistry } from "../src/imageProvider.ts";
import { launchImageStage, manualRetry, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { STAGE } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// change-active-provider-from-admin (JOS-171), group 4 — the image bind point (AC1, AC3, AC5): a scene binds to
// the provider active at its first attempt and keeps it for every retry, whatever is active later.

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
const ACCEPTED_PNG = buildPng(1920, 1088);

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image instruction ${i + 1}`, video: `video instruction ${i + 1}` })) };
  },
};

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => (predicate() ? resolve() : Date.now() - start > timeoutMs ? reject(new Error("waitFor timed out")) : setTimeout(tick, 5));
    tick();
  });
}
const settled = (sceneId: string) => waitFor(() => ["image-complete", "failed"].includes(getScene(sceneId)?.status ?? ""));

async function registeredScene(): Promise<{ runId: string; sceneId: string }> {
  const runId = randomUUID();
  createRun(runId, "Image binding test", "The lighthouse stands alone.", "en");
  const fragments: SegmentedFragment[] = [{ text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 6 } }];
  const result = await registerDecomposition(runId, fragments, generator, 6);
  if (!result.ok) throw new Error("fixture registration failed");
  return { runId, sceneId: result.sceneIds[0]! };
}

const stubA = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
const stubB = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });

function installRegistry(a = stubA, b = stubB): void {
  setImageProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": a, "stub-b": b } });
}

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  setVideoStageStartDelayMs(9_999_999);
  resetDownloadFetch();
  stubA.calls.length = 0;
  stubB.calls.length = 0;
  installRegistry();
});

describe("image binding to the active provider", () => {
  it("AC1: a scene's first attempt binds to the provider active at that moment and is sent there", async () => {
    const { sceneId } = await registeredScene();
    setActiveProvider("image", "stub-b");
    launchImageStage(sceneId);
    await settled(sceneId);
    expect(getScene(sceneId)!.provider).toBe("stub-b");
    expect(stubB.calls).toHaveLength(1);
    expect(stubA.calls).toHaveLength(0);
  });

  it("without a choice a scene binds to the settings default", async () => {
    const { sceneId } = await registeredScene();
    launchImageStage(sceneId);
    await settled(sceneId);
    expect(getScene(sceneId)!.provider).toBe("stub-a");
  });

  it("AC3 and AC5: a bound scene keeps its provider for a manual retry after the change, and nothing goes to the new one", async () => {
    const { runId, sceneId } = await registeredScene();
    installRegistry(createStubImageProvider("not-retryable-failure"), stubB);
    launchImageStage(sceneId);
    await settled(sceneId);
    expect(getScene(sceneId)).toMatchObject({ status: "failed", provider: "stub-a" });

    setActiveProvider("image", "stub-b");
    installRegistry(stubA, stubB);
    expect(manualRetry(runId, sceneId).ok).toBe(true);
    await settled(sceneId);
    expect(getScene(sceneId)).toMatchObject({ status: "image-complete", provider: "stub-a" });
    expect(stubA.calls).toHaveLength(1);
    expect(stubB.calls).toHaveLength(0);
  });

  it("AC4: a completed image is not requested again after the change", async () => {
    const { sceneId } = await registeredScene();
    launchImageStage(sceneId);
    await settled(sceneId);
    expect(stubA.calls).toHaveLength(1);

    setActiveProvider("image", "stub-b");
    launchImageStage(sceneId); // a duplicate launch, as a restart would make
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stubA.calls).toHaveLength(1);
    expect(stubB.calls).toHaveLength(0);
    expect(getScene(sceneId)).toMatchObject({ status: "image-complete", provider: "stub-a" });
  });
});
