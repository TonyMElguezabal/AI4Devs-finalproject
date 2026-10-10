import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  db,
  getAllInFlightScenes,
  getRun,
  getScene,
  getScenesForRun,
  resetAll,
  resolveArtefactPath,
} from "../src/db.ts";
import {
  continueSession,
  correctAndRetry,
  deriveSessionState,
  imageStageLauncher,
  launchImageStage,
  manualRetry,
  pauseSession,
  recoverOnBoot,
  setVideoStageStartDelayMs,
  resetVideoStageStartDelayMs,
} from "../src/orchestrator.ts";
import {
  createStubImageProvider,
  resetDownloadFetch,
  resetImageProviderRegistry,
  setDownloadFetch,
  setImageProviderRegistry,
  type ImageGenerationResult,
  type ImageProvider,
} from "../src/imageProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { getSubmittedScenesForRun, markSceneInFlight, markScenePendingRetry } from "../src/db.ts";
import { STAGE, STUB_PROVIDER_NAME } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// generate-chunk-image (JOS-145), groups 4 and 5 — AC1 (launch), AC2 (output
// check and completion), AC3 (independent progression), §12.2 (no expiring
// links) and design Decision 6 (a single synchronous await, no submit/poll,
// and how a restart is reconciled).

const TEST_PROVIDER_ID = "test-image-adapter"; // distinct from STUB_PROVIDER_NAME, the unbound sentinel

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

function stubGenerator(): VisualInstructionGenerator {
  return {
    async generate(texts) {
      return {
        kind: "success",
        pairs: texts.map((_, i) => ({ image: `image instruction ${i + 1}`, video: `video instruction ${i + 1}` })),
      };
    },
  };
}

/**
 * `launchImageStage` is deliberately not awaited by its own callers (design
 * Decision 7), so `await launchImageStage(id)` in a test resolves on the
 * next microtask, before the real async work (the adapter call, the
 * automatic retry chain) has necessarily settled. Every test that checks a
 * terminal outcome polls for it instead, mirroring `orchestrator.test.ts`'s
 * own `waitFor` for the same reason.
 */
function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 5): Promise<void> {
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

/** A stable terminal state: `image-complete` or `failed` never trigger a further automatic action on their own. */
async function waitForSettled(sceneId: string): Promise<void> {
  await waitFor(() => {
    const status = getScene(sceneId)?.status;
    return status === "image-complete" || status === "failed";
  });
}

/** Fails with `badBytes` on the first attempt, then succeeds with `goodBytes` — for proving a failed attempt is recorded, not just ignored. */
function failOnceThenSucceed(badBytes: Buffer, goodBytes: Buffer = ACCEPTED_PNG): ImageProvider & { calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async generate() {
      calls++;
      return { kind: "success", image: { source: "bytes", bytes: calls === 1 ? badBytes : goodBytes, contentType: "image/png" } };
    },
  };
}

/** One real, fully-registered chunk — through `registerDecomposition`, never `createScene`. */
async function registeredScene(script = "The lighthouse stands alone against the storm."): Promise<{
  runId: string;
  sceneId: string;
  projectFolder: string;
}> {
  const runId = randomUUID();
  const run = createRun(runId, "Image stage test", script, "en");
  const fragments: SegmentedFragment[] = [{ text: script, narrationInterval: { startSeconds: 0, endSeconds: 6 } }];
  const result = await registerDecomposition(runId, fragments, stubGenerator(), 6);
  if (!result.ok) throw new Error("fixture registration failed");
  return { runId, sceneId: result.sceneIds[0]!, projectFolder: run.projectFolder };
}

function useStubAdapter(adapter: ImageProvider) {
  setImageProviderRegistry({ defaultIdentifier: TEST_PROVIDER_ID, adapters: { [TEST_PROVIDER_ID]: adapter } });
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  // Prevent video stage from starting during image-stage tests: it would race
  // with waitForSettled's 5ms tick. Tests only care about image stage behavior.
  setVideoStageStartDelayMs(9_999_999);
  resetImageProviderRegistry();
  resetDownloadFetch();
});

describe("Launch (AC1)", () => {
  it("launches without User action, and is image-generating before the adapter is called", async () => {
    const { sceneId } = await registeredScene();
    let sceneStatusWhenCalled: string | undefined;
    const adapter: ImageProvider = {
      async generate() {
        sceneStatusWhenCalled = getScene(sceneId)?.status;
        return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
      },
    };
    useStubAdapter(adapter);

    await launchImageStage(sceneId);

    expect(sceneStatusWhenCalled).toBe("image-generating");
  });

  it("sends the chunk's IMAGE instruction, not its PROMPT or VIDEO instruction", async () => {
    const { sceneId } = await registeredScene();
    const stub = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    useStubAdapter(stub);

    await launchImageStage(sceneId);

    expect(stub.calls).toEqual(["image instruction 1"]);
  });

  it("sends no request and stays submitted while the session is paused", async () => {
    const { runId, sceneId } = await registeredScene();
    const stub = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    useStubAdapter(stub);
    pauseSession(runId);

    await launchImageStage(sceneId);

    expect(stub.calls).toEqual([]);
    expect(getScene(sceneId)?.status).toBe("submitted");
  });

  it("a chunk with no IMAGE instruction to generate from is not the concern of this precondition (registration already guarantees one)", async () => {
    // Documents the invariant tasks 4.1-4.10 rely on: registerDecomposition
    // never produces an empty imageInstruction (assign-scene-identifiers,
    // JOS-144). No separate check is needed in launchImageStage for it.
    const { sceneId } = await registeredScene();
    expect(getScene(sceneId)?.imageInstruction.length).toBeGreaterThan(0);
  });
});

describe("Output check and completion (AC2, §12.2)", () => {
  it("counts the adapter throwing (a network error, not a classified failure) as one transient attempt, then completes on the next attempt", async () => {
    const { sceneId } = await registeredScene();
    let calls = 0;
    useStubAdapter({
      async generate() {
        calls++;
        if (calls === 1) throw new Error("socket hang up");
        return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
      },
    });

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-complete");
    expect(scene.attempts).toBe(2);
    expect(scene.lastError).toMatch(/socket hang up/);
  });

  it("counts bytes that are not a readable image as one failed attempt, then completes on the next attempt", async () => {
    const { sceneId } = await registeredScene();
    const adapter = failOnceThenSucceed(Buffer.from("not an image at all"));
    useStubAdapter(adapter);

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-complete");
    expect(scene.attempts).toBe(2);
    expect(scene.lastError).toMatch(/dimensions could not be read/);
  });

  it("stores an accepted image under the project folder, records its relative path, and reaches image-complete, never chunk-complete", async () => {
    const { sceneId, projectFolder } = await registeredScene();
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG, contentType: "image/png" }));

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-complete");
    expect(scene.result).toMatch(/^scene-1-attempt-1\.png$/);
    expect(existsSync(resolveArtefactPath(projectFolder, scene.result!))).toBe(true);
  });

  it("downloads a temporary-link result to a local file before completing, and never stores the link itself", async () => {
    const { sceneId } = await registeredScene();
    setDownloadFetch((async () => new Response(new Uint8Array(ACCEPTED_PNG), { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch);
    useStubAdapter(createStubImageProvider("success-temporary-url", { url: "https://fal.media/files/example.png" }));

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-complete");
    expect(scene.result).not.toContain("http");
    expect(scene.result).toMatch(/\.png$/);
  });

  it("counts a failed download as one failed attempt, then completes on the next attempt", async () => {
    const { sceneId } = await registeredScene();
    let downloadCalls = 0;
    setDownloadFetch((async () => {
      downloadCalls++;
      return downloadCalls === 1 ? new Response("", { status: 500 }) : new Response(new Uint8Array(ACCEPTED_PNG), { status: 200 });
    }) as typeof fetch);
    useStubAdapter(createStubImageProvider("success-temporary-url", { url: "https://fal.media/files/example.png" }));

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-complete");
    expect(scene.attempts).toBe(2);
    expect(scene.lastError).toMatch(/HTTP 500/); // the first, failed attempt's cause is still recorded
    expect(downloadCalls).toBe(2);
  });

  it("counts an under-size image as one failed attempt, then completes on the next attempt", async () => {
    const { sceneId } = await registeredScene();
    const adapter = failOnceThenSucceed(buildPng(1024, 576));
    useStubAdapter(adapter);

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-complete");
    expect(scene.attempts).toBe(2);
    expect(scene.lastError).toMatch(/1024x576/);
    expect(adapter.calls).toBe(2);
  });

  it("counts a portrait image as one failed attempt, then completes on the next attempt", async () => {
    const { sceneId } = await registeredScene();
    const adapter = failOnceThenSucceed(buildPng(1080, 1920));
    useStubAdapter(adapter);

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("image-complete");
    expect(scene.attempts).toBe(2);
    expect(scene.lastError).toMatch(/1080x1920/);
  });

  it("a duplicate success commit leaves exactly one scene_results row and the stored result unchanged", async () => {
    const { sceneId } = await registeredScene();
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }));
    launchImageStage(sceneId);
    await waitForSettled(sceneId);
    const firstResult = getScene(sceneId)!.result;

    // Simulates a second, independent delivery for the same scene reaching
    // the same store-level guard `completeImageStage` relies on.
    const secondCommit = commitSceneResult(sceneId, "a-different-path.png");

    expect(secondCommit).toBe(false);
    expect(getScene(sceneId)!.result).toBe(firstResult);
    const count = (db.prepare("SELECT COUNT(*) c FROM scene_results WHERE scene_id = ?").get(sceneId) as { c: number }).c;
    expect(count).toBe(1);
  });
});

describe("A session made only of image-complete chunks is still processing (design Decision 4)", () => {
  it("derives to chunks-processing, not final-video", async () => {
    const { runId, sceneId } = await registeredScene();
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }));

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    expect(getScene(sceneId)?.status).toBe("image-complete");
    expect(deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure)).toEqual({ state: "chunks-processing" });
  });
});

describe("Provider binding (AC4)", () => {
  it("the first attempt binds the registry's default identifier to scenes.provider", async () => {
    const { sceneId } = await registeredScene();
    expect(getScene(sceneId)!.provider).toBe(STUB_PROVIDER_NAME);
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }));

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    expect(getScene(sceneId)!.provider).toBe(TEST_PROVIDER_ID);
  });

  it("a later attempt does not overwrite an already-bound provider, even if the registry's current default has moved on", async () => {
    const { sceneId } = await registeredScene();
    // A chunk already bound and held for retry (no need to run a full
    // transient-failure cycle to reach this precondition).
    db.prepare("UPDATE scenes SET provider = ?, status = 'submitted' WHERE id = ?").run(TEST_PROVIDER_ID, sceneId);
    const boundAdapter = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    const currentDefaultAdapter = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    setImageProviderRegistry({
      defaultIdentifier: "some-other-provider", // the build's current default has moved on since this chunk was bound
      adapters: { [TEST_PROVIDER_ID]: boundAdapter, "some-other-provider": currentDefaultAdapter },
    });

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    expect(getScene(sceneId)!.provider).toBe(TEST_PROVIDER_ID); // unchanged
    expect(boundAdapter.calls).toHaveLength(1); // sent to the bound adapter
    expect(currentDefaultAdapter.calls).toHaveLength(0); // never the build's current default
  });

  it("a bound provider with no adapter in the running build fails not-retryable, and no other provider is called", async () => {
    const { sceneId } = await registeredScene();
    db.prepare("UPDATE scenes SET provider = 'an-old-retired-provider' WHERE id = ?").run(sceneId);
    const fallback = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    setImageProviderRegistry({ defaultIdentifier: TEST_PROVIDER_ID, adapters: { [TEST_PROVIDER_ID]: fallback } });

    launchImageStage(sceneId);
    await waitForSettled(sceneId);

    expect(fallback.calls).toEqual([]);
    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("failed");
    expect(scene.provider).toBe("an-old-retired-provider");
    expect(scene.lastError).toMatch(/an-old-retired-provider/);
  });
});

describe("Independent progression (AC3, design Decision 5)", () => {
  async function twoRegisteredScenes(): Promise<{ runId: string; sceneIds: [string, string] }> {
    const runId = randomUUID();
    createRun(runId, "Independent progression test", "The lighthouse stands alone. The keeper lit the lamp.", "en");
    const fragments: SegmentedFragment[] = [
      { text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 6 } },
      { text: "The keeper lit the lamp.", narrationInterval: { startSeconds: 6, endSeconds: 12 } },
    ];
    const result = await registerDecomposition(runId, fragments, stubGenerator(), 12);
    if (!result.ok) throw new Error("fixture registration failed");
    return { runId, sceneIds: [result.sceneIds[0]!, result.sceneIds[1]!] };
  }

  it("a finished scene reaches image-complete while a sibling is still generating", async () => {
    const { sceneIds } = await twoRegisteredScenes();
    const [firstId, secondId] = sceneIds;
    let secondResolve!: (outcome: ImageGenerationResult) => void;
    let calls = 0;
    useStubAdapter({
      async generate() {
        calls++;
        if (calls === 1) return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
        return new Promise((resolve) => {
          secondResolve = resolve;
        });
      },
    });

    launchImageStage(firstId);
    launchImageStage(secondId);
    await waitForSettled(firstId);

    expect(getScene(firstId)?.status).toBe("image-complete");
    expect(getScene(secondId)?.status).toBe("image-generating"); // still held, unaffected by the first

    secondResolve({ kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } });
    await waitForSettled(secondId);
    expect(getScene(secondId)?.status).toBe("image-complete");
  });

  it("one scene's failure does not affect a sibling's progression", async () => {
    const { sceneIds } = await twoRegisteredScenes();
    const [firstId, secondId] = sceneIds;
    let calls = 0;
    useStubAdapter({
      async generate() {
        calls++;
        return calls === 1
          ? { kind: "failed_not_retryable", reason: "stub: content-filter rejection" }
          : { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
      },
    });

    launchImageStage(firstId);
    launchImageStage(secondId);
    await waitForSettled(firstId);
    await waitForSettled(secondId);

    expect(getScene(firstId)?.status).toBe("failed");
    expect(getScene(secondId)?.status).toBe("image-complete");
  });

  it("a result is scoped to its own session's chunk and project folder, even when two sessions share a chunk identifier", async () => {
    const sceneA = await registeredScene("Scene A's own narration.");
    const sceneB = await registeredScene("Scene B's own narration.");
    expect(getScene(sceneA.sceneId)!.index).toBe(1);
    expect(getScene(sceneB.sceneId)!.index).toBe(1); // same identifier, different session
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }));

    launchImageStage(sceneA.sceneId);
    await waitForSettled(sceneA.sceneId);

    expect(getScene(sceneA.sceneId)?.status).toBe("image-complete");
    expect(getScene(sceneB.sceneId)?.status).toBe("submitted"); // untouched by A's result
    const fullPathA = resolveArtefactPath(sceneA.projectFolder, getScene(sceneA.sceneId)!.result!);
    expect(existsSync(fullPathA)).toBe(true);
  });
});

describe("Resuming after a pause (continueSession)", () => {
  it("launches a real held chunk through the real adapter when the session continues", async () => {
    const { runId, sceneId } = await registeredScene();
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }));
    pauseSession(runId);
    expect(getScene(sceneId)?.status).toBe("submitted");

    continueSession(runId);
    await waitForSettled(sceneId);

    expect(getScene(sceneId)?.status).toBe("image-complete");
  });
});

describe("Pause gate scenarios (JOS-152, task 3.1)", () => {
  it("a scene queued for the cap slot when the pause arrives is not sent and releases the slot", async () => {
    // Both scenes must be in the SAME session so pause applies to both
    concurrency.setLimit(STAGE, 1);
    const runId = randomUUID();
    createRun(runId, "cap slot test", "The lighthouse stands alone. The keeper lit the lamp.", "en");
    const fragments: SegmentedFragment[] = [
      { text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 6 } },
      { text: "The keeper lit the lamp.", narrationInterval: { startSeconds: 6, endSeconds: 12 } },
    ];
    const reg = await registerDecomposition(runId, fragments, stubGenerator(), 12);
    if (!reg.ok) throw new Error("fixture failed");
    const [first, second] = reg.sceneIds;

    let resolveFirst!: (r: ImageGenerationResult) => void;
    useStubAdapter({
      generate(): Promise<ImageGenerationResult> {
        return new Promise((res) => { resolveFirst = res; });
      },
    });

    // first launches and holds the slot
    launchImageStage(first!);
    await waitFor(() => getScene(first!)?.status === "image-generating");

    // second queues (no slot available)
    launchImageStage(second!);

    // pause while second is queued
    pauseSession(runId);

    // release first so second's slot callback fires
    resolveFirst({ kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } });
    await waitFor(() => getScene(first!)?.status === "image-complete");

    // give second's slot callback time to run
    await new Promise((res) => setTimeout(res, 30));

    // second never consumed an attempt (its slot callback found the session paused)
    expect(getScene(second!)?.status).toBe("submitted");
    expect(getScene(second!)?.attempts).toBe(0);
  });

  it("an automatic retry after a transient failure during the pause is recorded but not sent", async () => {
    const { runId, sceneId } = await registeredScene();
    let resolveFirst!: (r: ImageGenerationResult) => void;
    let calls = 0;
    useStubAdapter({
      generate(): Promise<ImageGenerationResult> {
        calls++;
        return new Promise((res) => { resolveFirst = res; });
      },
    });

    launchImageStage(sceneId);
    // Wait until in-flight
    await waitFor(() => getScene(sceneId)?.status === "image-generating");

    pauseSession(runId); // pause while in-flight, before result

    // Let the in-flight request fail
    resolveFirst({ kind: "failed_transient", reason: "network blip" });
    // Wait for the failure to be applied (scene goes back to submitted = pending retry)
    await waitFor(() => getScene(sceneId)?.status === "submitted");

    const callsAfterPause = calls;
    await new Promise((res) => setTimeout(res, 40));
    // No retry was sent while paused
    expect(calls).toBe(callsAfterPause);
    expect(getScene(sceneId)!.attempts).toBe(1);
  });

  it("a manual retry on a real chunk goes through the image adapter, not the stub path (task 3.3)", async () => {
    const { runId, sceneId } = await registeredScene();
    // Make the first attempt fail not-retryably so scene is failed
    const stub = createStubImageProvider("not-retryable-failure");
    useStubAdapter(stub);
    launchImageStage(sceneId);
    await waitForSettled(sceneId);
    expect(getScene(sceneId)?.status).toBe("failed");

    // Switch to a succeeding adapter for the retry
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }));

    // manual retry while NOT paused: should go through image adapter
    const result = manualRetry(runId, sceneId);
    expect(result.ok).toBe(true);
    await waitForSettled(sceneId);

    // image adapter (not stub provider.ts) was called on retry
    expect(getScene(sceneId)?.status).toBe("image-complete");
  });

  it("a manual retry while paused is recorded as pending and not sent", async () => {
    const { runId, sceneId } = await registeredScene();
    const stub = createStubImageProvider("not-retryable-failure");
    useStubAdapter(stub);
    launchImageStage(sceneId);
    await waitForSettled(sceneId);
    expect(getScene(sceneId)?.status).toBe("failed");

    pauseSession(runId);
    const successAdapter = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    useStubAdapter(successAdapter);

    const result = manualRetry(runId, sceneId);
    expect(result.ok).toBe(true);

    await new Promise((res) => setTimeout(res, 30));
    // Held, not sent
    expect(getScene(sceneId)?.status).toBe("submitted");
    expect(successAdapter.calls).toEqual([]);
  });

  it("a correction while paused is recorded and not sent", async () => {
    const { runId, sceneId } = await registeredScene();
    useStubAdapter(createStubImageProvider("not-retryable-failure"));
    launchImageStage(sceneId);
    await waitForSettled(sceneId);
    expect(getScene(sceneId)?.status).toBe("failed");

    pauseSession(runId);
    const successAdapter = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    useStubAdapter(successAdapter);

    const result = correctAndRetry(runId, sceneId, "a corrected instruction");
    expect(result.ok).toBe(true);
    // retry-or-correct-image (JOS-157), design Decision 4 — a real chunk (registeredScene's
    // generator sets IMAGE) has imageInstruction corrected, never the legacy instruction field.
    expect(getScene(sceneId)?.imageInstruction).toBe("a corrected instruction");

    await new Promise((res) => setTimeout(res, 30));
    expect(getScene(sceneId)?.status).toBe("submitted"); // held
    expect(successAdapter.calls).toEqual([]);
  });

  // retry-or-correct-image (JOS-157), design Decision 6 — AC1/AC4: a retry sends the stored
  // IMAGE, byte for byte, to the provider the scene was already bound to.
  it("a retry sends the stored image_instruction to the provider unchanged, byte for byte", async () => {
    const { runId, sceneId } = await registeredScene();
    useStubAdapter(createStubImageProvider("not-retryable-failure"));
    launchImageStage(sceneId);
    await waitForSettled(sceneId);
    expect(getScene(sceneId)?.status).toBe("failed");
    const storedInstruction = getScene(sceneId)!.imageInstruction;

    const successAdapter = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    useStubAdapter(successAdapter);

    expect(manualRetry(runId, sceneId).ok).toBe(true);
    await waitForSettled(sceneId);

    expect(successAdapter.calls).toEqual([storedInstruction]);
  });

  it("a retry stays bound to the provider from the first attempt, even if the registry default changes", async () => {
    const { runId, sceneId } = await registeredScene();
    const providerA = createStubImageProvider("not-retryable-failure");
    setImageProviderRegistry({ defaultIdentifier: "provider-a", adapters: { "provider-a": providerA } });
    launchImageStage(sceneId);
    await waitForSettled(sceneId);
    expect(getScene(sceneId)?.status).toBe("failed");
    expect(getScene(sceneId)?.provider).toBe("provider-a");

    const providerB = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    setImageProviderRegistry({
      defaultIdentifier: "provider-b",
      adapters: { "provider-a": providerA, "provider-b": providerB },
    });

    expect(manualRetry(runId, sceneId).ok).toBe(true);
    await waitForSettled(sceneId);

    expect(getScene(sceneId)?.provider).toBe("provider-a"); // binding unchanged
    expect(providerB.calls).toEqual([]); // never sent to the new default
    expect(providerA.calls.length).toBe(2); // the original failing attempt plus the retry
  });

  it("a request that succeeds during the pause is applied and nothing new is launched", async () => {
    const { runId, sceneId } = await registeredScene();
    let resolveAdapter!: (result: ImageGenerationResult) => void;
    useStubAdapter({
      generate(): Promise<ImageGenerationResult> {
        return new Promise((res) => { resolveAdapter = res; });
      },
    });

    launchImageStage(sceneId);
    await new Promise((res) => setTimeout(res, 5)); // let it reach image-generating
    expect(getScene(sceneId)?.status).toBe("image-generating");

    pauseSession(runId); // pause while in-flight

    // Resolve the in-flight request
    resolveAdapter({ kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } });
    await waitForSettled(sceneId);

    // Result applied, stage complete
    expect(getScene(sceneId)?.status).toBe("image-complete");
    // Session paused marker still set
    expect(getRun(runId)?.paused).toBe(true);
  });

  it("a request that fails during the pause is applied and the retry is held", async () => {
    const { runId, sceneId } = await registeredScene();
    let resolveAdapter!: (result: ImageGenerationResult) => void;
    let adapterCalls = 0;
    useStubAdapter({
      generate(): Promise<ImageGenerationResult> {
        adapterCalls++;
        return new Promise((res) => { resolveAdapter = res; });
      },
    });

    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-generating");

    pauseSession(runId);

    // Fail the in-flight request
    resolveAdapter({ kind: "failed_transient", reason: "server error during pause" });
    // Wait for the failure to be applied (back to submitted = pending retry)
    await waitFor(() => getScene(sceneId)?.status === "submitted");

    const callsAfterPause = adapterCalls;
    await new Promise((res) => setTimeout(res, 40));
    // Retry was NOT sent while paused
    expect(adapterCalls).toBe(callsAfterPause);
    expect(getScene(sceneId)?.attempts).toBe(1);
    expect(getRun(runId)?.paused).toBe(true);
  });
});

describe("Restart reconciliation (design Decision 6)", () => {
  it("a scene left image-generating on boot is reconciled as one failed transient attempt, never left polling", async () => {
    const { sceneId } = await registeredScene();
    useStubAdapter(createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG }));
    // Simulate a crash mid-attempt: bound, in flight, but no provider_requests
    // row was ever inserted (the real call never resolved).
    db.prepare("UPDATE scenes SET status = 'image-generating', provider = ?, current_request_id = ?, attempts = 1 WHERE id = ?").run(
      TEST_PROVIDER_ID,
      randomUUID(),
      sceneId,
    );
    expect(getAllInFlightScenes().map((s) => s.id)).toContain(sceneId);

    const summary = recoverOnBoot();

    expect(summary.recordedFailedAttempt).toBe(1);
    expect(summary.stillPending).toBe(0);
    // The retry rule's automatic relaunch runs synchronously up to its own
    // first `await` (design Decision 6), so by the time `recoverOnBoot`
    // returns the scene is already back in `image-generating`, mid-retry —
    // not left `submitted` waiting for something to poll.
    expect(getScene(sceneId)!.status).toBe("image-generating");
    expect(getScene(sceneId)!.lastError).toMatch(/interrupted by a restart/);

    await waitForSettled(sceneId);
    expect(getScene(sceneId)!.status).toBe("image-complete"); // the retry itself succeeded
  });
});

// JOS-152 task 4.1 — image launcher heldWork
describe("image stage launcher heldWork (JOS-152, task 4.1)", () => {
  async function twoScenesInSession(): Promise<{ runId: string; sceneId1: string; sceneId2: string }> {
    const runId = randomUUID();
    createRun(runId, "heldWork test", "Scene one. Scene two.", "en");
    const fragments: SegmentedFragment[] = [
      { text: "Scene one.", narrationInterval: { startSeconds: 0, endSeconds: 6 } },
      { text: "Scene two.", narrationInterval: { startSeconds: 6, endSeconds: 12 } },
    ];
    const result = await registerDecomposition(runId, fragments, stubGenerator(), 12);
    if (!result.ok) throw new Error("fixture failed");
    return { runId, sceneId1: result.sceneIds[0]!, sceneId2: result.sceneIds[1]! };
  }

  it("heldWork lists submitted scenes in ascending index order", async () => {
    const { runId, sceneId1, sceneId2 } = await twoScenesInSession();
    const scenes = getSubmittedScenesForRun(runId);
    const held = imageStageLauncher.heldWork(runId);
    expect(held.count).toBe(2);
    expect(held.sceneIds[0]).toBe(scenes[0]!.id);
    expect(held.sceneIds[1]).toBe(scenes[1]!.id);
    expect([sceneId1, sceneId2]).toContain(held.sceneIds[0]);
  });

  it("heldWork returns nothing for scenes already in flight", async () => {
    const { runId, sceneId1 } = await twoScenesInSession();
    // Directly mark scene 1 as in-flight without driving the full async lifecycle
    markSceneInFlight(sceneId1, randomUUID(), 1);
    expect(getScene(sceneId1)!.status).toBe("image-generating");
    const held = imageStageLauncher.heldWork(runId);
    expect(held.sceneIds).not.toContain(sceneId1);
  });

  it("a pending retry (submitted after a transient failure) is held", async () => {
    const { runId, sceneId1 } = await twoScenesInSession();
    // Simulate: the scene went in-flight once, then a transient failure marked it back to submitted
    markSceneInFlight(sceneId1, randomUUID(), 1);
    markScenePendingRetry(sceneId1, "test transient failure");
    // Scene is now submitted with attempts = 1 (a pending retry)
    expect(getScene(sceneId1)!.status).toBe("submitted");
    expect(getScene(sceneId1)!.attempts).toBe(1);
    const held = imageStageLauncher.heldWork(runId);
    expect(held.sceneIds).toContain(sceneId1);
  });

  it("a submitted scene in a non-paused session is still reported by heldWork (heldWork is pause-agnostic)", async () => {
    // heldWork's job is to enumerate what would be launched on continue;
    // it is the caller's responsibility to call it only while paused.
    const { runId } = await twoScenesInSession();
    const held = imageStageLauncher.heldWork(runId);
    expect(held.count).toBe(2);
  });
});
