import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  correctImageInstruction,
  correctLegacyInstruction,
  correctVideoInstruction,
  createRun,
  db,
  getRun,
  resetAll,
  resolveArtefactPath,
} from "../src/db.ts";

// keep-project-files-locally (JOS-162), design Decision 5 — a correction
// accepted by `correctImageInstruction`, `correctLegacyInstruction` or
// `correctVideoInstruction` (JOS-157/JOS-158) is also recorded in the
// project folder's `corrected-instructions.json`, not only the store.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Correction persistence test", "A short script.", "en");
  return runId;
}

/** A scene inserted directly, bypassing registration, so each test controls exactly the columns its correction checks. */
function insertScene(runId: string, overrides: Record<string, string | number | null> = {}): string {
  const sceneId = randomUUID();
  const columns = {
    id: sceneId,
    run_id: runId,
    idx: 1,
    status: "failed",
    instruction: "old legacy instruction",
    image_instruction: "old image instruction",
    video_instruction: "old video instruction",
    result: null,
    video_result: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  const names = Object.keys(columns);
  const placeholders = names.map(() => "?").join(", ");
  db.prepare(`INSERT INTO scenes (${names.join(", ")}) VALUES (${placeholders})`).run(...Object.values(columns));
  return sceneId;
}

function readCorrectedInstructions(runId: string): any {
  const projectFolder = getRun(runId)!.projectFolder;
  return JSON.parse(readFileSync(resolveArtefactPath(projectFolder, "corrected-instructions.json"), "utf8"));
}

describe("A correction is also recorded in corrected-instructions.json (JOS-162, Decision 5)", () => {
  it("correctImageInstruction records the corrected IMAGE with a timestamp", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId); // status failed, result NULL — correctable

    expect(correctImageInstruction(runId, sceneId, "a corrected image instruction")).toBe(true);

    const file = readCorrectedInstructions(runId);
    expect(file.scenes[sceneId].imageInstruction).toBe("a corrected image instruction");
    expect(typeof file.scenes[sceneId].correctedAt).toBe("string");
  });

  it("correctLegacyInstruction records the corrected legacy instruction", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    expect(correctLegacyInstruction(runId, sceneId, "a corrected legacy instruction")).toBe(true);

    const file = readCorrectedInstructions(runId);
    expect(file.scenes[sceneId].instruction).toBe("a corrected legacy instruction");
  });

  it("correctVideoInstruction records the corrected VIDEO", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId, { result: "scene-1.png" }); // image already committed, video not yet

    expect(correctVideoInstruction(runId, sceneId, "a corrected video instruction")).toBe(true);

    const file = readCorrectedInstructions(runId);
    expect(file.scenes[sceneId].videoInstruction).toBe("a corrected video instruction");
  });

  it("a refused correction (scene not failed) leaves no file behind", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId, { status: "submitted" });

    expect(correctImageInstruction(runId, sceneId, "should not apply")).toBe(false);

    const projectFolder = getRun(runId)!.projectFolder;
    expect(existsSync(resolveArtefactPath(projectFolder, "corrected-instructions.json"))).toBe(false);
  });

  it("a second correction of the same scene updates in place rather than duplicating", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);
    correctImageInstruction(runId, sceneId, "first correction");

    // The scene fails again and is corrected a second time.
    db.prepare("UPDATE scenes SET status = 'failed' WHERE id = ?").run(sceneId);
    correctImageInstruction(runId, sceneId, "second correction");

    const file = readCorrectedInstructions(runId);
    expect(Object.keys(file.scenes)).toEqual([sceneId]);
    expect(file.scenes[sceneId].imageInstruction).toBe("second correction");
  });

  it("keeps another scene's correction when a different scene is corrected", () => {
    const runId = newRunId();
    const sceneA = insertScene(runId);
    const sceneB = insertScene(runId, { idx: 2 });
    correctImageInstruction(runId, sceneA, "scene A correction");

    correctLegacyInstruction(runId, sceneB, "scene B correction");

    const file = readCorrectedInstructions(runId);
    expect(file.scenes[sceneA].imageInstruction).toBe("scene A correction");
    expect(file.scenes[sceneB].instruction).toBe("scene B correction");
  });
});
