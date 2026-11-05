import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrationsTo,
  commitSceneResult,
  commitSceneVideoResult,
  countSceneResults,
  createRun,
  db,
  getRun,
  getScene,
  markSceneForRebuild,
  resetAll,
  resolveArtefactPath,
  setFinalVideoPath,
} from "../src/db.ts";

// rebuild-scene (JOS-235), design Decisions 1 and 5 — the one conditional write that returns a generated scene to
// `submitted` with its results withdrawn, and marks a final video older than the scene.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Rebuild transition", "A short script.", "en");
  return runId;
}

/** A scene inserted directly, with the columns of a generated one, so each test controls exactly what the write checks. */
function insertScene(runId: string, overrides: Record<string, string | number | null> = {}): string {
  const sceneId = randomUUID();
  const columns = {
    id: sceneId,
    run_id: runId,
    idx: 1,
    status: "chunk-complete",
    attempts: 2,
    last_error: "an old error",
    instruction: "legacy instruction",
    image_instruction: "old image instruction",
    video_instruction: "old video instruction",
    result: "scene-1-attempt-2.png",
    video_result: "scene-1.mp4",
    provider: "image-provider-a",
    video_provider: "video-provider-a",
    requested_duration_seconds: 8,
    narration_start_seconds: 1.5,
    narration_end_seconds: 9.5,
    current_request_id: "request-1",
    video_request_sent_at: "2026-10-28T10:00:00.000Z",
    video_request: "{}",
    updated_at: "2026-10-28T10:00:00.000Z",
    ...overrides,
  };
  const names = Object.keys(columns);
  db.prepare(`INSERT INTO scenes (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...Object.values(columns));
  commitSceneResult(sceneId, "scene-1-attempt-2.png");
  commitSceneVideoResult(sceneId, "scene-1.mp4");
  return sceneId;
}

const rebuildCount = (sceneId: string) => (db.prepare("SELECT rebuild_count c FROM scenes WHERE id = ?").get(sceneId) as { c: number }).c;
const guardRows = (sceneId: string) =>
  (db.prepare("SELECT COUNT(*) c FROM scene_video_results WHERE scene_id = ?").get(sceneId) as { c: number }).c;

describe("which scenes can be rebuilt", () => {
  it.each(["image-complete", "chunk-complete"])("accepts a scene in %s", (status) => {
    const runId = newRunId();
    const sceneId = insertScene(runId, { status });

    expect(markSceneForRebuild(runId, sceneId, {})).toBe(true);
    expect(getScene(sceneId)!.status).toBe("submitted");
  });

  it.each(["submitted", "image-generating", "video-generating", "failed"])("refuses a scene in %s and changes nothing", (status) => {
    const runId = newRunId();
    const sceneId = insertScene(runId, { status });
    const before = getScene(sceneId);

    expect(markSceneForRebuild(runId, sceneId, { imageInstruction: "new" })).toBe(false);

    expect(getScene(sceneId)).toEqual(before);
    expect(rebuildCount(sceneId)).toBe(0);
  });

  it("refuses a scene of another session", () => {
    const sceneId = insertScene(newRunId());

    expect(markSceneForRebuild(newRunId(), sceneId, {})).toBe(false);
    expect(getScene(sceneId)!.status).toBe("chunk-complete");
  });

  it("accepts only the first of two back-to-back calls", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    expect(markSceneForRebuild(runId, sceneId, {})).toBe(true);
    expect(markSceneForRebuild(runId, sceneId, {})).toBe(false);
    expect(rebuildCount(sceneId)).toBe(1);
  });
});

describe("what an accepted rebuild changes", () => {
  it("returns the scene to submitted with its results, attempts and request withdrawn", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForRebuild(runId, sceneId, {});

    expect(getScene(sceneId)).toMatchObject({
      status: "submitted",
      result: null,
      videoResult: null,
      attempts: 0,
      lastError: null,
      videoRequestSentAt: null,
      videoRequestBody: null,
    });
    expect(db.prepare("SELECT current_request_id r FROM scenes WHERE id = ?").get(sceneId)).toEqual({ r: null });
    expect(rebuildCount(sceneId)).toBe(1);
  });

  it("withdraws the one-result guards so the new image and clip can be committed", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);
    expect(countSceneResults(sceneId)).toBe(1);

    markSceneForRebuild(runId, sceneId, {});

    expect(countSceneResults(sceneId)).toBe(0);
    expect(guardRows(sceneId)).toBe(0);
    expect(commitSceneResult(sceneId, "scene-1-r1-attempt-1.png")).toBe(true);
    expect(commitSceneVideoResult(sceneId, "scene-1-r1.mp4")).toBe(true);
  });

  it("keeps the bound providers, the requested duration and the narration interval", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForRebuild(runId, sceneId, { imageInstruction: "new image", videoInstruction: "new video" });

    expect(getScene(sceneId)).toMatchObject({
      provider: "image-provider-a",
      videoProvider: "video-provider-a",
      requestedDurationSeconds: 8,
      narrationInterval: { startSeconds: 1.5, endSeconds: 9.5 },
    });
  });

  it("does not touch another scene", () => {
    const runId = newRunId();
    const target = insertScene(runId, { idx: 1 });
    const other = insertScene(runId, { idx: 2 });
    const otherBefore = getScene(other);

    markSceneForRebuild(runId, target, {});

    expect(getScene(other)).toEqual(otherBefore);
    expect(guardRows(other)).toBe(1);
  });

  it("counts every rebuild of the same scene", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);
    markSceneForRebuild(runId, sceneId, {});
    db.prepare("UPDATE scenes SET status = 'chunk-complete' WHERE id = ?").run(sceneId);

    markSceneForRebuild(runId, sceneId, {});

    expect(rebuildCount(sceneId)).toBe(2);
  });
});

describe("the instructions", () => {
  it("stores the given ones and keeps an omitted one", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForRebuild(runId, sceneId, { imageInstruction: "  fixed image  " });

    expect(getScene(sceneId)).toMatchObject({ imageInstruction: "fixed image", videoInstruction: "old video instruction" });
  });

  it("records a changed instruction like a correction", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForRebuild(runId, sceneId, { videoInstruction: "slower camera" });

    const recorded = JSON.parse(readFileSync(resolveArtefactPath(getRun(runId)!.projectFolder, "corrected-instructions.json"), "utf8"));
    expect(recorded.scenes[sceneId]).toMatchObject({ videoInstruction: "slower camera" });
  });

  it("writes nothing to the corrections file when no instruction is given", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForRebuild(runId, sceneId, {});

    expect(() => readFileSync(resolveArtefactPath(getRun(runId)!.projectFolder, "corrected-instructions.json"), "utf8")).toThrow();
  });

  it("applies the image instruction of a skeleton scene to its legacy instruction", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId, { image_instruction: "" });

    markSceneForRebuild(runId, sceneId, { imageInstruction: "legacy fix" });

    expect(getScene(sceneId)).toMatchObject({ instruction: "legacy fix", imageInstruction: "" });
  });
});

describe("the final video's staleness", () => {
  const stale = (runId: string) => (db.prepare("SELECT final_video_stale s FROM runs WHERE id = ?").get(runId) as { s: number }).s;

  it("marks an existing final video as older than the rebuilt scene", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);
    setFinalVideoPath(runId, "final-video.mp4");

    markSceneForRebuild(runId, sceneId, {});

    expect(stale(runId)).toBe(1);
    expect(getRun(runId)!.finalVideoStale).toBe(true);
  });

  it("marks nothing when the session has no final video", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForRebuild(runId, sceneId, {});

    expect(stale(runId)).toBe(0);
    expect(getRun(runId)!.finalVideoStale).toBe(false);
  });

  it("marks nothing when the rebuild is refused", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId, { status: "video-generating" });
    setFinalVideoPath(runId, "final-video.mp4");

    markSceneForRebuild(runId, sceneId, {});

    expect(stale(runId)).toBe(0);
  });
});

describe("migration 26", () => {
  it("adds the two columns with their defaults and leaves existing runs and scenes as they were", () => {
    const target = new DatabaseSync(":memory:");
    target.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    `);
    applyMigrationsTo(target, 25);
    target.prepare("INSERT INTO runs (id, title, created_at) VALUES ('run-1', 'T', '2026-10-05T10:00:00.000Z')").run();
    target.prepare("INSERT INTO scenes (id, run_id, idx, status) VALUES ('scene-1', 'run-1', 1, 'chunk-complete')").run();

    expect(applyMigrationsTo(target, 26)).toEqual([26]);

    expect(target.prepare("SELECT rebuild_count AS n FROM scenes").get()).toEqual({ n: 0 });
    expect(target.prepare("SELECT final_video_stale AS n FROM runs").get()).toEqual({ n: 0 });
    expect(target.prepare("SELECT status FROM scenes").get()).toEqual({ status: "chunk-complete" });
  });
});
