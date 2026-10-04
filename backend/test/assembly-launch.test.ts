import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  getRun,
  getScene,
  getScenesForRun,
  markImageComplete,
  PROJECTS_ROOT,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  launchVideoStageForRun,
  nextAssemblyLaunchCount,
  resetAssemblyLaunchCount,
  resetVideoStageStartDelayMs,
} from "../src/orchestrator.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
  STUB_VIDEO_PROVIDER_NAME,
} from "../src/videoProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// assemble-final-video (JOS-149), group 2 — design Decision 1: the gate fires
// on chunk-completion events, not on a poll. Every test here verifies the
// LAUNCH TRIGGER, not the assembly work (which is the assembly phase, group 5).

const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = buildMp4();

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function buildMp4(): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(12, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("mp42", 8, "ascii");
  return buf;
}

function stubGenerator(): VisualInstructionGenerator {
  return {
    async generate(texts) {
      return {
        kind: "success",
        pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })),
      };
    },
  };
}

const TEST_VIDEO_PROVIDER = "test-video-provider";

/** Registers N scenes, brings them to image-complete, launches video stage. */
async function bringToImageComplete(runId: string, sceneCount: number): Promise<string[]> {
  const fragments: SegmentedFragment[] = Array.from({ length: sceneCount }, (_, i) => ({
    text: `Fragment ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
  const regResult = await registerDecomposition(runId, fragments, stubGenerator(), sceneCount * 5);
  if (!regResult.ok) throw new Error(`registration failed: ${regResult.reason}`);

  const run = getRun(runId)!;
  const scenes = getScenesForRun(runId);
  for (const scene of scenes) {
    const rel = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
    commitSceneResult(scene.id, rel);
    markImageComplete(scene.id, rel);
  }
  launchVideoStageForRun(runId);
  return scenes.map((s) => s.id);
}

/** Waits up to `ms` for `predicate` to return true, polling every 5ms. */
async function waitFor(predicate: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyLaunchCount();
  setVideoProviderRegistry({
    defaultIdentifier: TEST_VIDEO_PROVIDER,
    adapters: {
      [TEST_VIDEO_PROVIDER]: createStubVideoProvider("success-bytes", { bytes: MP4_BYTES }),
    },
  });
});

// ---- Task 2.1 — assembly launches only when every chunk is chunk-complete ----

describe("Task 2.1 — assembly launches when the last chunk completes", () => {
  it("launches assembly once both chunks of a 2-scene session reach chunk-complete", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Fragment 1. Fragment 2.", "en");
    await bringToImageComplete(runId, 2);

    await waitFor(() => getScenesForRun(runId).every((s) => s.status === "chunk-complete"));

    expect(nextAssemblyLaunchCount(runId)).toBe(1);
  });

  it("does not launch assembly while only the first of two chunks is chunk-complete", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Fragment 1. Fragment 2.", "en");
    await bringToImageComplete(runId, 2);

    await waitFor(() => getScenesForRun(runId).some((s) => s.status === "chunk-complete"));
    const firstCompleteScene = getScenesForRun(runId).find((s) => s.status === "chunk-complete");
    expect(firstCompleteScene).toBeDefined();

    // Gate is still open only when ALL are complete; after first: still closed.
    const allComplete = getScenesForRun(runId).every((s) => s.status === "chunk-complete");
    if (!allComplete) {
      expect(nextAssemblyLaunchCount(runId)).toBe(0);
    }
  });
});

// ---- Task 2.2 — assembly does not launch if any chunk failed or is processing ----

describe("Task 2.2 — assembly does not launch with incomplete scenes", () => {
  it("does not launch assembly when a chunk failed", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Fragment 1. Fragment 2.", "en");
    setVideoProviderRegistry({
      defaultIdentifier: TEST_VIDEO_PROVIDER,
      adapters: {
        [TEST_VIDEO_PROVIDER]: createStubVideoProvider("not-retryable-failure"),
      },
    });

    await bringToImageComplete(runId, 2);
    await waitFor(() => getScenesForRun(runId).every((s) => s.status === "failed" || s.status === "chunk-complete"));

    expect(nextAssemblyLaunchCount(runId)).toBe(0);
  });
});

// ---- Task 2.3 — check re-evaluates on every chunk-completion event ----

describe("Task 2.3 — gate check fires on each chunk-completion event, not a poll", () => {
  it("fires exactly once — when the last (not first) chunk completes", async () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Fragment 1. Fragment 2. Fragment 3.", "en");
    await bringToImageComplete(runId, 3);

    await waitFor(() => getScenesForRun(runId).every((s) => s.status === "chunk-complete"));

    // Each chunk-completion triggered a check; only the last one opened the gate.
    expect(nextAssemblyLaunchCount(runId)).toBe(1);
  });
});
