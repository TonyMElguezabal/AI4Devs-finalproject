import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commitSceneResult,
  db,
  getRun,
  getScene,
  getScenesForRun,
  markImageComplete,
  resolveArtefactPath,
  setScenePauseEdit,
  writeArtefactOnce,
} from "../src/db.ts";
import { rebuildFinalVideo } from "../src/finalVideoRebuild.ts";
import { launchVideoStageForRun, recoverOnBoot, toSnapshot } from "../src/orchestrator.ts";
import { rebuildScene } from "../src/sceneRebuild.ts";
import { getStageAttempts } from "../src/db.ts";
import { resetImageProviderRegistry, setImageProviderRegistry, type ImageProvider } from "../src/imageProvider.ts";
import { finishedSession, resetRebuildEnvironment, waitFor } from "./rebuildFixtures.ts";
import { imageProviderFromGenerate } from "./imageProviderFixtures.ts";

// rebuild-scene (JOS-235), design Decisions 5-8 — the final video follows a rebuilt scene by itself, and the existing
// "Rebuild final video" stays the way out when the automatic rebuild did not finish.

const IMAGE_PROVIDER = "test-image-provider";

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

/** An image provider that answers at once, except for an instruction containing "slow", which waits for `release()`. */
function controllableImageProvider(): { provider: ImageProvider; release: () => void } {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const provider: ImageProvider = imageProviderFromGenerate(async (instruction) => {
    if (instruction.includes("slow")) await gate;
    return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
  });
  return { provider, release: () => release() };
}

let imageGate: ReturnType<typeof controllableImageProvider>;

beforeEach(() => {
  resetRebuildEnvironment();
  imageGate = controllableImageProvider();
  setImageProviderRegistry({ defaultIdentifier: IMAGE_PROVIDER, adapters: { [IMAGE_PROVIDER]: imageGate.provider } });
});

afterEach(() => {
  resetImageProviderRegistry();
});

describe("a session with a final video", () => {
  it("builds version 2 by itself, with the rebuilt scene's new clip and the other scenes' clips as they were", async () => {
    const { runId, sceneIds, calls } = await finishedSession();

    expect(rebuildScene(runId, sceneIds[0]!, { imageInstruction: "fixed image" })).toEqual({ ok: true, held: false });
    expect(getRun(runId)!.finalVideoStale).toBe(true);

    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.clips[0]!.clipPath).toMatch(/scene-1-r1\.mp4$/);
    expect(calls[1]!.clips[1]!.clipPath).toBe(calls[0]!.clips[1]!.clipPath);
    const run = getRun(runId)!;
    expect(run.finalVideoStale).toBe(false);
    expect(existsSync(resolveArtefactPath(run.projectFolder, "final-video.mp4"))).toBe(true);
    expect(getStageAttempts(runId, "assembly").map((attempt) => attempt.cycle)).toEqual([1, 2]);
  });

  it("builds one version after the last of two rebuilt scenes completes, and none before", async () => {
    const { runId, sceneIds, calls } = await finishedSession();

    rebuildScene(runId, sceneIds[0]!, {});
    rebuildScene(runId, sceneIds[1]!, { imageInstruction: "slow fix" });
    await waitFor(() => getScene(sceneIds[0]!)?.status === "chunk-complete" && getScene(sceneIds[0]!)?.rebuildCount === 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(1); // scene 2 is still being rebuilt: no assembly yet

    imageGate.release();
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.clips.map((clip) => clip.clipPath.split("/").at(-1))).toEqual(["scene-1-r1.mp4", "scene-2-r1.mp4"]);
  });

  it("keeps the previous final video and the stale mark when the automatic rebuild fails, and offers Rebuild final video", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession();
    setMode("not-retryable");

    rebuildScene(runId, sceneIds[0]!, {});
    await waitFor(() => getStageAttempts(runId, "assembly").at(-1)?.outcome === "not-retryable");

    const run = getRun(runId)!;
    expect(run.finalVideoPath).toBe("final-video.mp4");
    expect(run.failure).toBeNull();
    expect(run.finalVideoStale).toBe(true);
    expect(run.rebuildRequestedAt).toBeNull();
    const snapshot = toSnapshot(runId)!.session;
    expect(snapshot.state).toBe("final-video");
    expect(snapshot.finalVideo).toMatchObject({ staleScenes: true, pendingPauseEdits: false });
    expect(snapshot.finalVideo?.rebuildFailure).toBeDefined();

    setMode("success");
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls.at(-1)!.clips[0]!.clipPath).toMatch(/scene-1-r1\.mp4$/);
    expect(getRun(runId)!.finalVideoStale).toBe(false);
  });

  it("does not relaunch an interrupted automatic rebuild after a restart, and keeps offering Rebuild final video", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession();
    setMode({ slowMs: 5000 });
    rebuildScene(runId, sceneIds[0]!, {});
    await waitFor(() => getStageAttempts(runId, "assembly").at(-1)?.outcome === "in-flight");

    recoverOnBoot();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(2); // the first assembly and the interrupted rebuild
    expect(getRun(runId)).toMatchObject({ finalVideoPath: "final-video.mp4", finalVideoStale: true, rebuildRequestedAt: null });
    expect(toSnapshot(runId)!.session.finalVideo?.staleScenes).toBe(true);
  });
});

describe("a session whose assembly failed", () => {
  it("assembles again by itself after a scene is rebuilt, and ends with its final video", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession({ finish: false });
    setMode("not-retryable");
    const run = getRun(runId)!;
    for (const scene of getScenesForRun(runId)) {
      const image = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
      commitSceneResult(scene.id, image);
      markImageComplete(scene.id, image);
    }
    launchVideoStageForRun(runId);
    await waitFor(() => getRun(runId)?.failure?.phase === "assembly");
    expect(getRun(runId)!.finalVideoPath).toBeNull();
    setMode("success");

    rebuildScene(runId, sceneIds[0]!, {});

    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video.mp4");
    expect(getRun(runId)!.failure).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.clips[0]!.clipPath).toMatch(/scene-1-r1\.mp4$/);
    expect(toSnapshot(runId)!.session.state).toBe("final-video");
  });
});

describe("Rebuild final video (design Decision 7)", () => {
  it("is refused with scenes-not-complete while a scene is not complete, even with pause edits pending", async () => {
    const { runId, sceneIds, calls } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    db.prepare("UPDATE scenes SET status = 'image-generating' WHERE id = ?").run(sceneIds[1]!);

    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "scenes-not-complete" });

    expect(getRun(runId)!.rebuildRequestedAt).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toHaveLength(1);
  });

  it("is still refused with nothing-to-rebuild when there are no pause edits and no rebuilt scene", async () => {
    const { runId } = await finishedSession();

    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "nothing-to-rebuild" });
  });
});
