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
import { continueSession, deriveSessionState, launchImageStage, pauseSession, reconcileOnBoot } from "../src/orchestrator.ts";
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
function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 5): Promise<void> {
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
  const fragments: SegmentedFragment[] = [{ text: script, narratedDurationSeconds: 6 }];
  const result = await registerDecomposition(runId, fragments, stubGenerator());
  if (!result.ok) throw new Error("fixture registration failed");
  return { runId, sceneId: result.sceneIds[0]!, projectFolder: run.projectFolder };
}

function useStubAdapter(adapter: ImageProvider) {
  setImageProviderRegistry({ defaultIdentifier: TEST_PROVIDER_ID, adapters: { [TEST_PROVIDER_ID]: adapter } });
}

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
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
      { text: "The lighthouse stands alone.", narratedDurationSeconds: 6 },
      { text: "The keeper lit the lamp.", narratedDurationSeconds: 6 },
    ];
    const result = await registerDecomposition(runId, fragments, stubGenerator());
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

    const summary = reconcileOnBoot();

    expect(summary.recordedFailedAttempt).toBe(1);
    expect(summary.stillPending).toBe(0);
    // The retry rule's automatic relaunch runs synchronously up to its own
    // first `await` (design Decision 6), so by the time `reconcileOnBoot`
    // returns the scene is already back in `image-generating`, mid-retry —
    // not left `submitted` waiting for something to poll.
    expect(getScene(sceneId)!.status).toBe("image-generating");
    expect(getScene(sceneId)!.lastError).toMatch(/interrupted by a restart/);

    await waitForSettled(sceneId);
    expect(getScene(sceneId)!.status).toBe("image-complete"); // the retry itself succeeded
  });
});
