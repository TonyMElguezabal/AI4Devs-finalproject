import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, getRun, getScene, rebindFailedClip, rebindSceneImageProvider, rebindSessionStage, resetAll } from "../src/db.ts";
import { failImage, failVideo, failVoice, installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";

// move-failed-stage-to-active-provider (JOS-172), group 4 — design Decisions 1 and 4: the rebinding writes in the store.

let locksBefore: string[];
beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
  locksBefore = triggers().sort();
});
afterEach(() => removeTwoProvidersPerStage());

const LOCKS = ["scenes_requested_duration_seconds_locked", "scenes_duration_warning_locked", "scenes_speed_factor_locked", "scenes_speed_factor_warning_locked"];
const triggers = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'scenes_%_locked'").all() as Array<{ name: string }>).map((row) => row.name);
const clip = { requestedDurationSeconds: 10, durationWarning: null, speedFactor: 1.25, speedFactorWarning: null } as const;

describe("rebindSessionStage", () => {
  it("rebinds only while the binding is still the expected one", () => {
    const runId = newRun();
    failVoice(runId, "stub-a");
    expect(rebindSessionStage(runId, "voice", "stub-x", "stub-b")).toBe(false);
    expect(getRun(runId)!.voiceProviderId).toBe("stub-a");
    expect(rebindSessionStage(runId, "voice", "stub-a", "stub-b")).toBe(true);
    expect(getRun(runId)!.voiceProviderId).toBe("stub-b");
  });
});

describe("rebindSceneImageProvider", () => {
  it("rebinds a failed image stage, and nothing else, when the binding is the expected one", async () => {
    const { sceneIds: [scene] } = await registerScenes([7]);
    failImage(scene!, "stub-a");
    expect(rebindSceneImageProvider(scene!, "stub-x", "stub-b")).toBe(false);
    expect(rebindSceneImageProvider(scene!, "stub-a", "stub-b")).toBe(true);
    expect(getScene(scene!)).toMatchObject({ provider: "stub-b", status: "failed" });
  });

  it("refuses a scene that is not failed", async () => {
    const { sceneIds: [scene] } = await registerScenes([7]);
    db.prepare("UPDATE scenes SET provider = 'stub-a' WHERE id = ?").run(scene!);
    expect(rebindSceneImageProvider(scene!, "stub-a", "stub-b")).toBe(false);
  });
});

describe("rebindFailedClip", () => {
  it("replaces the four duration and speed values and the binding, and leaves the chunk, its instructions and its image alone", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    failVideo(runId, scene!, "stub-a");
    const before = getScene(scene!)!;

    expect(rebindFailedClip(scene!, "stub-a", "stub-b", clip)).toBe(true);

    const after = getScene(scene!)!;
    expect(after).toMatchObject({ videoProvider: "stub-b", status: "failed", requestedDurationSeconds: 10, durationWarning: null, speedFactor: 1.25, speedFactorWarning: null });
    expect(after.narrationInterval).toEqual(before.narrationInterval);
    expect([after.imageInstruction, after.videoInstruction, after.result]).toEqual([before.imageInstruction, before.videoInstruction, before.result]);
  });

  it("refuses a scene that is not a failed clip, or whose binding changed, and changes nothing", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    failVideo(runId, scene!, "stub-a");
    const before = getScene(scene!)!;
    expect(rebindFailedClip(scene!, "stub-x", "stub-b", clip)).toBe(false);
    db.prepare("UPDATE scenes SET status = 'chunk-complete' WHERE id = ?").run(scene!);
    expect(rebindFailedClip(scene!, "stub-a", "stub-b", clip)).toBe(false);
    expect(getScene(scene!)).toMatchObject({ videoProvider: "stub-a", requestedDurationSeconds: before.requestedDurationSeconds, speedFactor: before.speedFactor });
  });

  it("puts the four locks back: a direct update of any of the four columns is refused afterwards", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    failVideo(runId, scene!, "stub-a");
    rebindFailedClip(scene!, "stub-a", "stub-b", clip);

    expect(LOCKS.every((name) => triggers().includes(name))).toBe(true);
    expect(triggers().sort()).toEqual(locksBefore);
    for (const column of ["requested_duration_seconds", "duration_warning", "speed_factor", "speed_factor_warning"]) {
      expect(() => db.prepare(`UPDATE scenes SET ${column} = ${column} WHERE id = ?`).run(scene!), column).toThrow(/locked: scenes\./);
    }
  });

  it("puts the locks back even when the update fails inside it", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    failVideo(runId, scene!, "stub-a");
    db.exec("CREATE TRIGGER test_abort BEFORE UPDATE OF video_provider ON scenes BEGIN SELECT RAISE(ABORT, 'boom'); END;");
    try {
      expect(() => rebindFailedClip(scene!, "stub-a", "stub-b", clip)).toThrow(/boom/);
    } finally {
      db.exec("DROP TRIGGER test_abort");
    }
    expect(triggers().sort()).toEqual(locksBefore);
    expect(getScene(scene!)).toMatchObject({ videoProvider: "stub-a" });
  });

  it("is the only code that lifts the locks: no other source file drops a trigger", () => {
    const sourceDir = join(dirname(fileURLToPath(import.meta.url)), "../src");
    const files = readdirSync(sourceDir, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => /DROP TRIGGER/i.test(readFileSync(join(sourceDir, file), "utf8")));
    expect(files).toEqual(["db.ts"]);
  });
});
