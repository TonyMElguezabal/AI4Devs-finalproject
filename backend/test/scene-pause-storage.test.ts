import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearScenePauseEdit,
  createRun,
  db,
  getFinalVideoBuilds,
  getRun,
  getScene,
  getScenePauseEdits,
  insertFinalVideoBuild,
  nextFinalVideoVersion,
  replaceFinalVideoPath,
  resetAll,
  setFinalVideoPath,
  setScenePauseEdit,
} from "../src/db.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { contiguousFragments, voiceOverDurationOf } from "./fragmentFixtures.ts";

// adjust-scene-pause (JOS-190), group 4 — design Decision 3: one mutable table that holds only User intent, one
// write-once table that records what each rebuilt file was built with. Neither may disturb a locked record.

const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide. Lanterns come on one by one.";
const FRAGMENTS = contiguousFragments([
  { text: "The harbor is quiet at dusk.", seconds: 6 },
  { text: "Fishing boats return with the tide.", seconds: 9.5 },
  { text: "Lanterns come on one by one.", seconds: 7 },
]);

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

async function registeredSession(): Promise<{ runId: string; sceneIds: string[] }> {
  const runId = randomUUID();
  createRun(runId, "Pause storage test", SCRIPT, "en");
  const result = await registerDecomposition(runId, FRAGMENTS, generator, voiceOverDurationOf(FRAGMENTS));
  if (!result.ok) throw new Error("registration failed in the test setup");
  return { runId, sceneIds: result.sceneIds };
}

beforeEach(() => {
  resetAll();
});

describe("scene_pause_edits", () => {
  it("stores an edit per scene and replaces it in place", async () => {
    const { runId, sceneIds } = await registeredSession();

    setScenePauseEdit(runId, sceneIds[1]!, 1.1);
    setScenePauseEdit(runId, sceneIds[1]!, 1.5);
    setScenePauseEdit(runId, sceneIds[0]!, 0.4);

    expect(getScenePauseEdits(runId)).toEqual(new Map([[sceneIds[1]!, 1.5], [sceneIds[0]!, 0.4]]));
    expect((db.prepare("SELECT COUNT(*) c FROM scene_pause_edits").get() as { c: number }).c).toBe(2);
  });

  it("removes the edit when it is cleared, which means 'the original pause'", async () => {
    const { runId, sceneIds } = await registeredSession();
    setScenePauseEdit(runId, sceneIds[1]!, 1.1);

    clearScenePauseEdit(sceneIds[1]!);

    expect(getScenePauseEdits(runId).size).toBe(0);
  });

  it("keeps one session's edits out of another's read", async () => {
    const first = await registeredSession();
    const second = await registeredSession();

    setScenePauseEdit(first.runId, first.sceneIds[0]!, 1.1);

    expect(getScenePauseEdits(second.runId).size).toBe(0);
  });

  it("refuses a negative pause at the store", async () => {
    const { runId, sceneIds } = await registeredSession();

    expect(() => setScenePauseEdit(runId, sceneIds[0]!, -0.1)).toThrow();
  });

  it("never changes a locked scene record, and the lock triggers still fire", async () => {
    const { runId, sceneIds } = await registeredSession();
    const before = getScene(sceneIds[1]!);

    setScenePauseEdit(runId, sceneIds[1]!, 1.1);

    const after = getScene(sceneIds[1]!);
    expect(after?.narrationInterval).toEqual(before?.narrationInterval);
    expect(after?.requestedDurationSeconds).toBe(before?.requestedDurationSeconds);
    expect(after?.speedFactor).toBe(before?.speedFactor);
    expect(() => db.prepare("UPDATE scenes SET narration_end_seconds = 1 WHERE id = ?").run(sceneIds[1]!)).toThrow(/locked/);
    expect(() => db.prepare("UPDATE scenes SET speed_factor = 1 WHERE id = ?").run(sceneIds[1]!)).toThrow(/locked/);
  });
});

describe("final_video_builds", () => {
  it("numbers the first rebuild 2 (the original file is version 1) and then counts up", async () => {
    const { runId } = await registeredSession();

    expect(nextFinalVideoVersion(runId)).toBe(2);
    insertFinalVideoBuild({ runId, version: 2, path: "final-video-2.mp4", pauses: { a: 1.1 }, createdAt: "2026-10-15T10:00:00.000Z" });

    expect(nextFinalVideoVersion(runId)).toBe(3);
  });

  it("records the file and the edits it was built with, in order", async () => {
    const { runId } = await registeredSession();

    expect(insertFinalVideoBuild({ runId, version: 2, path: "final-video-2.mp4", pauses: { a: 1.1, b: 0.4 }, createdAt: "2026-10-15T10:00:00.000Z" })).toBe(true);
    expect(insertFinalVideoBuild({ runId, version: 3, path: "final-video-3.mp4", pauses: {}, createdAt: "2026-10-15T11:00:00.000Z" })).toBe(true);

    expect(getFinalVideoBuilds(runId)).toEqual([
      { runId, version: 2, path: "final-video-2.mp4", pauses: { a: 1.1, b: 0.4 }, createdAt: "2026-10-15T10:00:00.000Z" },
      { runId, version: 3, path: "final-video-3.mp4", pauses: {}, createdAt: "2026-10-15T11:00:00.000Z" },
    ]);
  });

  it("refuses a second record of the same version, so two rebuilds cannot both win", async () => {
    const { runId } = await registeredSession();
    insertFinalVideoBuild({ runId, version: 2, path: "final-video-2.mp4", pauses: {}, createdAt: "2026-10-15T10:00:00.000Z" });

    expect(insertFinalVideoBuild({ runId, version: 2, path: "other.mp4", pauses: {}, createdAt: "2026-10-15T10:01:00.000Z" })).toBe(false);
    expect(getFinalVideoBuilds(runId)).toHaveLength(1);
  });

  it("cannot be updated or deleted once recorded", async () => {
    const { runId } = await registeredSession();
    insertFinalVideoBuild({ runId, version: 2, path: "final-video-2.mp4", pauses: {}, createdAt: "2026-10-15T10:00:00.000Z" });

    expect(() => db.prepare("UPDATE final_video_builds SET path = 'x' WHERE run_id = ?").run(runId)).toThrow(/locked/);
    expect(() => db.prepare("DELETE FROM final_video_builds WHERE run_id = ?").run(runId)).toThrow(/locked/);
  });
});

describe("replaceFinalVideoPath (compare-and-set)", () => {
  it("moves the current final video only from the path the caller saw", async () => {
    const { runId } = await registeredSession();
    setFinalVideoPath(runId, "final-video.mp4");

    expect(replaceFinalVideoPath(runId, "final-video.mp4", "final-video-2.mp4")).toBe(true);
    expect(getRun(runId)?.finalVideoPath).toBe("final-video-2.mp4");
  });

  it("refuses a stale expectation and leaves the path alone", async () => {
    const { runId } = await registeredSession();
    setFinalVideoPath(runId, "final-video.mp4");
    replaceFinalVideoPath(runId, "final-video.mp4", "final-video-2.mp4");

    expect(replaceFinalVideoPath(runId, "final-video.mp4", "final-video-3.mp4")).toBe(false);
    expect(getRun(runId)?.finalVideoPath).toBe("final-video-2.mp4");
  });

  it("refuses when the session has no final video yet", async () => {
    const { runId } = await registeredSession();

    expect(replaceFinalVideoPath(runId, "final-video.mp4", "final-video-2.mp4")).toBe(false);
    expect(getRun(runId)?.finalVideoPath).toBeNull();
  });
});

describe("migration 16", () => {
  it("is recorded and created both tables", () => {
    const applied = (db.prepare("SELECT version FROM schema_migrations WHERE version = 16").get() as { version: number } | undefined)?.version;
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('scene_pause_edits', 'final_video_builds')").all() as Array<{ name: string }>).map((row) => row.name).sort();

    expect(applied).toBe(16);
    expect(tables).toEqual(["final_video_builds", "scene_pause_edits"]);
  });
});
