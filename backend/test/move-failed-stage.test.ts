import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setActiveProvider } from "../src/activeProvider.ts";
import { db, getRun, getScene, getScenesForRun, getStageAttempts, resetAll, stageInstanceKeyOf } from "../src/db.ts";
import { resetKeyStoreCache, storeProfileKey } from "../src/keyStore.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { listFailedStages, moveFailedStage } from "../src/failedStages.ts";
import { failDecomposition, failImage, failVideo, failVoice, installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { markImageSweepDone } from "./imageProviderFixtures.ts";

// move-failed-stage-to-active-provider (JOS-172), group 5 — design Decisions 1, 3 and 4: what a move changes, and what it
// never changes or refuses.

let keyFolder: string;
beforeEach(() => {
  resetAll();
  keyFolder = mkdtempSync(join(tmpdir(), "vid4you-move-keys-"));
  process.env.PROVIDER_KEY_PATH = join(keyFolder, "provider-keys.key");
  resetKeyStoreCache();
  installTwoProvidersPerStage();
});
afterEach(() => {
  removeTwoProvidersPerStage();
  rmSync(keyFolder, { recursive: true, force: true });
  delete process.env.PROVIDER_KEY_PATH;
  resetKeyStoreCache();
});

/** A video profile with a key, made the active video provider (the real registries, so its range is the one read). */
function activateVideoProfile(id: string, min: number, max: number): void {
  removeTwoProvidersPerStage();
  insertProfile({ id, stage: "video", adapterType: "runninghub-video", label: id, parameters: { endpoint: "/openapi/v2/other", admittedDurationSeconds: { min, max } } }, "2099-01-01T00:00:00.000Z");
  storeProfileKey(id, "video-key-1234567890");
  db.prepare("INSERT OR REPLACE INTO active_providers (stage, provider_id, changed_at) VALUES ('video', ?, '2026-10-22T00:00:00.000Z')").run(id);
}

const attemptCount = () => (db.prepare("SELECT COUNT(*) AS n FROM stage_attempts").get() as { n: number }).n;

describe("moving a failed stage binds it to the active provider and nothing else", () => {
  it("voice: the session binding is stub-b, no attempt is recorded and the failure stays", () => {
    const runId = newRun();
    failVoice(runId);
    const failure = getRun(runId)!.failure;

    const result = moveFailedStage({ sessionId: runId, stage: "voice" });

    expect(result).toEqual({ ok: true, moved: { sessionId: runId, stage: "voice", sceneId: null, providerId: "stub-b", providerLabel: "stub-b", requestedDurationSeconds: null } });
    expect(getRun(runId)!.voiceProviderId).toBe("stub-b");
    expect(getRun(runId)!.failure).toEqual(failure);
    expect(attemptCount()).toBe(0);
    expect(listFailedStages()).toEqual([]);
  });

  it.each([
    ["alignment", "alignmentProviderId"],
    ["reasoning", "decompositionProviderId"],
  ] as const)("%s: the session binding is stub-b and the failure stays", (stage, field) => {
    const runId = newRun();
    failDecomposition(runId, stage);
    expect(moveFailedStage({ sessionId: runId, stage })).toMatchObject({ ok: true });
    expect(getRun(runId)![field]).toBe("stub-b");
    expect(getRun(runId)!.failure).not.toBeNull();
  });

  it("image: the scene binding is stub-b and the scene is still failed, unchanged otherwise", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([7]);
    failImage(scene!);
    markImageSweepDone(runId); // the end-of-session sweep would resend the failed scene when the move publishes the session
    const before = getScene(scene!)!;

    const result = moveFailedStage({ sessionId: runId, stage: "image", sceneId: scene! });

    expect(result).toMatchObject({ ok: true, moved: { sceneId: scene, providerId: "stub-b", requestedDurationSeconds: null } });
    expect(getScene(scene!)).toEqual({ ...before, provider: "stub-b", updatedAt: expect.any(String) });
    expect(attemptCount()).toBe(0);
  });

  it("keeps the stage where it was moved when the active provider changes again", () => {
    const runId = newRun();
    failVoice(runId);
    moveFailedStage({ sessionId: runId, stage: "voice" });
    setActiveProvider("voice", "stub-a");
    expect(getRun(runId)!.voiceProviderId).toBe("stub-b");
  });
});

describe("a moved clip chooses its duration again from the new provider (AC4)", () => {
  it("8 s interval, shipped 5 to 15 s to 5 to 7 s: 7 s with factor 8/7, the chunk unchanged", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    expect(getScene(scene!)).toMatchObject({ requestedDurationSeconds: 8, speedFactor: 1 });
    failVideo(runId, scene!, "stub-a");
    const before = getScene(scene!)!;
    activateVideoProfile("long", 5, 7);

    const result = moveFailedStage({ sessionId: runId, stage: "video", sceneId: scene! });

    expect(result).toMatchObject({ ok: true, moved: { providerId: "long", requestedDurationSeconds: 7 } });
    const after = getScene(scene!)!;
    expect(after.speedFactor).toBeCloseTo(8 / 7, 6);
    expect(after).toMatchObject({ videoProvider: "long", requestedDurationSeconds: 7, durationWarning: "exceeds-maximum" });
    expect(after.narrationInterval).toEqual(before.narrationInterval);
    expect([after.imageInstruction, after.videoInstruction, after.result, after.status]).toEqual([before.imageInstruction, before.videoInstruction, before.result, "failed"]);
  });

  it("14 s interval to a 5 to 10 s provider: 10 s with the exceeds-maximum warning", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([14]);
    failVideo(runId, scene!, "stub-a");
    activateVideoProfile("short", 5, 10);

    expect(moveFailedStage({ sessionId: runId, stage: "video", sceneId: scene! })).toMatchObject({ ok: true, moved: { requestedDurationSeconds: 10 } });
    expect(getScene(scene!)).toMatchObject({ requestedDurationSeconds: 10, durationWarning: "exceeds-maximum" });
  });
});

describe("a move keeps what is complete (AC3)", () => {
  it("leaves the other scenes, their images and clips, untouched", async () => {
    const { runId, sceneIds: [done, failed] } = await registerScenes([7, 8]);
    failVideo(runId, done!, "stub-a");
    db.prepare("UPDATE scenes SET status = 'chunk-complete' WHERE id = ?").run(done!);
    failImage(failed!);
    const doneBefore = getScene(done!)!;

    moveFailedStage({ sessionId: runId, stage: "image", sceneId: failed! });

    expect(getScene(done!)).toEqual(doneBefore);
    expect(getScenesForRun(runId)).toHaveLength(2);
    expect(attemptCount()).toBe(0);
  });
});

describe("refusals change nothing", () => {
  it("not-found for an unknown session or scene", async () => {
    expect(moveFailedStage({ sessionId: "nope", stage: "voice" })).toEqual({ ok: false, reason: "not-found" });
    const { runId } = await registerScenes([7]);
    expect(moveFailedStage({ sessionId: runId, stage: "image", sceneId: "nope" })).toEqual({ ok: false, reason: "not-found" });
  });

  it("not-failed for a stage that did not fail, a scene whose clip is complete, and a stage with no binding", async () => {
    const runId = newRun();
    expect(moveFailedStage({ sessionId: runId, stage: "voice" })).toEqual({ ok: false, reason: "not-failed" });
    const { runId: sceneRun, sceneIds: [scene] } = await registerScenes([7]);
    expect(moveFailedStage({ sessionId: sceneRun, stage: "image", sceneId: scene! })).toEqual({ ok: false, reason: "not-failed" });
    failVideo(sceneRun, scene!, "stub-a");
    db.prepare("UPDATE scenes SET status = 'chunk-complete' WHERE id = ?").run(scene!);
    const before = getScene(scene!)!;
    expect(moveFailedStage({ sessionId: sceneRun, stage: "video", sceneId: scene! })).toEqual({ ok: false, reason: "not-failed" });
    expect(getScene(scene!)).toEqual(before);
  });

  it("already-on-active when the stage is on the active provider", () => {
    const runId = newRun();
    failVoice(runId, "stub-b");
    expect(moveFailedStage({ sessionId: runId, stage: "voice" })).toEqual({ ok: false, reason: "already-on-active" });
  });

  it("not-retryable for a session failure that offers no manual retry", () => {
    const runId = newRun();
    failVoice(runId, "stub-a", false);
    expect(moveFailedStage({ sessionId: runId, stage: "voice" })).toEqual({ ok: false, reason: "not-retryable" });
    expect(getRun(runId)!.voiceProviderId).toBe("stub-a");
  });

  it("retry-in-progress when a retry of the stage is scheduled or in flight", () => {
    const runId = newRun();
    failVoice(runId);
    db.prepare(
      "INSERT INTO stage_attempts (id, run_id, stage, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, outcome) VALUES ('a1', ?, 'voice-over', ?, 1, 1, 'initial', 'stub-a', 1, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z', 'in-flight')",
    ).run(runId, stageInstanceKeyOf(runId, "voice-over"));
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
    expect(moveFailedStage({ sessionId: runId, stage: "voice" })).toEqual({ ok: false, reason: "retry-in-progress" });
    expect(getRun(runId)!.voiceProviderId).toBe("stub-a");
  });

  it("not-usable when the active provider has no API key that can be found", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([7]);
    failImage(scene!, "stub-a");
    removeTwoProvidersPerStage();
    insertProfile({ id: "nokey", stage: "image", adapterType: "fal-image", label: "No key", parameters: { model: "m" } }, "2099-01-01T00:00:00.000Z");
    db.prepare("INSERT OR REPLACE INTO active_providers (stage, provider_id, changed_at) VALUES ('image', 'nokey', '2026-10-22T00:00:00.000Z')").run();
    expect(moveFailedStage({ sessionId: runId, stage: "image", sceneId: scene! })).toEqual({ ok: false, reason: "not-usable" });
    expect(getScene(scene!)!.provider).toBe("stub-a");
  });
});
