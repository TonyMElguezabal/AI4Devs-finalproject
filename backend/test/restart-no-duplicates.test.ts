import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { bindSceneImageProvider, createRun, createScene, db, getScene, resetAll } from "../src/db.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { launchImageStage, resetVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { simulateRestart } from "./restartHelpers.ts";

// preserve-progress-across-restarts (JOS-160), spec restart-recovery — "A restart never sends a unit of work twice"
// (the assembly case is in restart-assembly.test.ts).

const IMAGE_ADAPTER = "restart-image-adapter";
let imageRequests = 0;

beforeEach(() => {
  resetAll();
  resetVideoStageStartDelayMs();
  imageRequests = 0;
  resetImageProviderRegistry();
  setImageProviderRegistry({
    defaultIdentifier: IMAGE_ADAPTER,
    adapters: {
      [IMAGE_ADAPTER]: {
        generate: () => {
          imageRequests++;
          return new Promise(() => {}); // never answers: the scene stays in flight
        },
      },
    },
  });
});

async function settleMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

/** A scene whose image request was sent to the bound adapter before the restart. */
function sceneInFlightBeforeRestart(attempts: number): string {
  const runId = randomUUID();
  createRun(runId, "No duplicates", "A script.", "en");
  const sceneId = randomUUID();
  createScene(sceneId, runId, 1, "success", 100, "a harbor at dawn");
  bindSceneImageProvider(sceneId, IMAGE_ADAPTER);
  db.prepare("UPDATE scenes SET status = 'image-generating', current_request_id = ?, attempts = ? WHERE id = ?").run(randomUUID(), attempts, sceneId);
  return sceneId;
}

describe("A restart never sends a unit of work twice (5.1)", () => {
  it("an image attempt settled with budget left is relaunched exactly once across settle and relaunch", async () => {
    const sceneId = sceneInFlightBeforeRestart(1);

    simulateRestart();
    await settleMicrotasks();

    expect(imageRequests).toBe(1);
    expect(getScene(sceneId)!.attempts).toBe(2);
  });

  it("a live launch event arriving after boot recovery does not send the same scene again", async () => {
    const runId = randomUUID();
    createRun(runId, "Live event", "A script.", "en");
    const sceneId = randomUUID();
    createScene(sceneId, runId, 1, "success", 100, "a harbor at dawn");
    db.prepare("UPDATE scenes SET image_instruction = 'a harbor at dawn' WHERE id = ?").run(sceneId); // a real image-stage scene

    simulateRestart();
    await settleMicrotasks();
    expect(imageRequests).toBe(1);

    launchImageStage(sceneId); // the live event for the scene boot recovery already launched
    await settleMicrotasks();

    expect(imageRequests).toBe(1);
    expect(getScene(sceneId)!.attempts).toBe(1);
  });
});
