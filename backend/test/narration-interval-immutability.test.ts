import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { createRun, db, getScene, getScenesForRun, resetAll } from "../src/db.ts";
import { correctAndRetry, launchScene, manualRetry, RETRY_BUDGET, setVideoStageStartDelayMs, resetVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import { STAGE } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { contiguousFragments, voiceOverDurationOf } from "./fragmentFixtures.ts";

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
  resetVideoStageStartDelayMs();
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  setVideoStageStartDelayMs(9_999_999);
});

describe("A chunk's interval survives processing and retries (AC4)", () => {
  it("is unchanged after the stage completes", async () => {
    const { runId, sceneId } = await registeredSession();

    launchScene(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");

    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);
  });

  it("is unchanged after a failure, its automatic retries, a manual retry and a corrected instruction", async () => {
    const { runId, sceneId } = await registeredSession();
    db.prepare("UPDATE scenes SET provider_mode = 'transient_failure', provider_latency_ms = 5 WHERE id = ?").run(sceneId);

    launchScene(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "failed");
    expect(getScene(sceneId)?.attempts).toBe(1 + RETRY_BUDGET);
    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);

    expect(manualRetry(sceneId).ok).toBe(true);
    await waitFor(() => getScene(sceneId)?.status === "failed");
    expect(intervalsOf(runId)).toEqual(REGISTERED_INTERVALS);

    db.prepare("UPDATE scenes SET provider_mode = 'success' WHERE id = ?").run(sceneId);
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
