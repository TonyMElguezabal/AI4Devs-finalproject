import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, resetAll } from "../src/db.ts";
import { listFailedStages } from "../src/failedStages.ts";
import { failDecomposition, failImage, failVideo, failVoice, installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";

// move-failed-stage-to-active-provider (JOS-172), group 3 — design Decisions 2 and 3: which failed stages `/admin` lists.

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
});

afterEach(() => removeTwoProvidersPerStage());

const stagesOf = () => listFailedStages().map((row) => [row.stage, row.sceneNumber, row.boundProviderId, row.activeProviderId]);

describe("listFailedStages", () => {
  it("lists a failed voice stage bound to another provider with the session, both providers and the cause", () => {
    const runId = newRun("Harbor");
    failVoice(runId);
    expect(listFailedStages()).toEqual([
      {
        sessionId: runId,
        sessionTitle: "Harbor",
        stage: "voice",
        sceneId: null,
        sceneNumber: null,
        boundProviderId: "stub-a",
        boundProviderLabel: "stub-a",
        activeProviderId: "stub-b",
        activeProviderLabel: "stub-b",
        cause: "the voice provider answered HTTP 503",
      },
    ]);
  });

  it("tells the alignment step from the reasoning step by whether the narration timestamps are stored", () => {
    failDecomposition(newRun("Before timestamps"), "alignment");
    failDecomposition(newRun("After timestamps"), "reasoning");
    expect(stagesOf().map(([stage]) => stage).sort()).toEqual(["alignment", "reasoning"]);
  });

  it("lists a failed image scene and a failed clip with their scene numbers", async () => {
    const { runId, sceneIds: [first, second] } = await registerScenes([7, 8], "Scenes");
    failImage(first!);
    failVideo(runId, second!);
    expect(stagesOf()).toEqual([
      ["image", 1, "stub-a", "stub-b"],
      ["video", 2, "stub-a", "stub-b"],
    ]);
  });

  it("does not list a stage already on the active provider", () => {
    failVoice(newRun(), "stub-b");
    expect(listFailedStages()).toEqual([]);
  });

  it("does not list a stage that has not failed", async () => {
    const { sceneIds: [scene] } = await registerScenes([7]);
    db.prepare("UPDATE scenes SET provider = 'stub-a', status = 'image-generating' WHERE id = ?").run(scene!);
    expect(listFailedStages()).toEqual([]);
  });

  it("does not list a failed alignment step that bound no provider (native timestamps)", () => {
    const runId = newRun();
    failDecomposition(runId, "alignment");
    db.prepare("UPDATE runs SET alignment_provider_id = NULL WHERE id = ?").run(runId);
    expect(listFailedStages()).toEqual([]);
  });

  it("does not list a session-level failure that offers no manual retry", () => {
    failVoice(newRun(), "stub-a", false);
    failDecomposition(newRun(), "reasoning", "stub-a", false);
    expect(listFailedStages()).toEqual([]);
  });

  it("does not list a session that has no failure, or a failed assembly (no provider)", () => {
    newRun();
    expect(listFailedStages()).toEqual([]);
  });

  it("resolves a legacy image binding to the seeded profile before comparing it with the active provider", async () => {
    removeTwoProvidersPerStage(); // the real registries: the seeded image profile `Fal.ai` is active
    const { sceneIds: [scene] } = await registerScenes([7]);
    failImage(scene!, "fal-ai/flux/dev"); // what an earlier build stored: the same provider as the active `Fal.ai`
    expect(listFailedStages()).toEqual([]);
  });
});
