import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAll } from "../src/db.ts";
import { countedAttempts, countedAttemptsOfRuns } from "../src/providerUsageReport.ts";
import { installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, requestedSecondsOf, seedAttempt, seedSceneAttempt, seedVoiceOver } from "./providerUsageFixtures.ts";

// report-estimated-cost (JOS-227), task 2.1 — design Decisions 1, 4: the shared attempt rows carry the run id and the
// units of failed attempts, and can be read for a set of sessions with no period.

const AT = "2026-10-05T10:00:00.000Z";
const BEFORE_PERIOD = "2026-09-05T10:00:00.000Z";

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
});

afterEach(() => removeTwoProvidersPerStage());

describe("countedAttempts", () => {
  it("gives failed attempts their units by the unit rule", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", scriptLength: 40 });
    const timestampsRun = seedAttempt({ stage: "timestamps", providerId: "align-a", sentAt: AT, outcome: "timed-out" });
    seedVoiceOver(timestampsRun, 12);
    seedAttempt({ stage: "decomposition", providerId: "reason-a", sentAt: AT, outcome: "not-retryable" });
    const { sceneIds } = await registerScenes([6]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "transient_failure", latencyMs: 10, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 10, sentAt: AT });

    const units = Object.fromEntries(countedAttempts(PERIOD.from, PERIOD.to).map((attempt) => [attempt.stage, attempt.units]));
    expect(units).toEqual({ voice: 40, alignment: 12, reasoning: 1, image: 1, video: requestedSecondsOf(sceneIds[0]!) });
  });

  it("gives each row the run id of its session", async () => {
    const voiceRun = seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    const { runId: sceneRun, sceneIds } = await registerScenes([5]);
    bindScene(sceneIds[0]!, { provider: "img-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 10, sentAt: AT });

    const runIds = Object.fromEntries(countedAttempts(PERIOD.from, PERIOD.to).map((attempt) => [attempt.stage, attempt.runId]));
    expect(runIds).toEqual({ voice: voiceRun, image: sceneRun });
  });
});

describe("countedAttemptsOfRuns", () => {
  it("returns only the given sessions' rows, whenever they were sent", async () => {
    const wanted = seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: BEFORE_PERIOD, outcome: "success" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", runId: wanted });
    seedAttempt({ stage: "voice-over", providerId: "voice-b", sentAt: AT, outcome: "success" });
    const { runId: sceneRun, sceneIds } = await registerScenes([5]);
    bindScene(sceneIds[0]!, { videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "success", latencyMs: 10, sentAt: BEFORE_PERIOD });

    const rows = countedAttemptsOfRuns([wanted, sceneRun]);
    expect(rows.map((row) => [row.runId, row.providerId]).sort()).toEqual([[sceneRun, "vid-a"], [wanted, "voice-a"], [wanted, "voice-a"]].sort());
  });

  it("returns nothing for no sessions", () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    expect(countedAttemptsOfRuns([])).toEqual([]);
  });
});
