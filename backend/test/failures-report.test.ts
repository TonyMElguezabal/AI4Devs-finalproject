import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, resetAll } from "../src/db.ts";
import { failuresReport } from "../src/failuresReport.ts";
import { providerUsageReport } from "../src/providerUsageReport.ts";
import { failImage, failVideo, installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";

// report-failures-and-retries (JOS-224), tasks 2.1–2.5 — design Decisions 1–6: failed attempts per stage and outcome, exhausted budgets,
// manual retries, the session-level failure wordings and the scenes failed now.

const AT = "2026-10-05T10:00:00.000Z";

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
});

afterEach(() => removeTwoProvidersPerStage());

const stageRow = (stage: string) => failuresReport(PERIOD).stages.find((row) => row.stage === stage);

describe("failuresReport — failed attempts per stage and outcome", () => {
  it("counts transient, not-retryable and timed-out attempts of the session-level stages and of the scene stages", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "timed-out" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 700, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 100, sentAt: AT });

    expect(stageRow("voice")).toMatchObject({ transient: 2, notRetryable: 0, timedOut: 1 });
    expect(stageRow("video")).toMatchObject({ transient: 0, notRetryable: 1, timedOut: 0 });
    expect(stageRow("image")).toBeUndefined();
  });

  it("lists the stages in the order voice, alignment, reasoning, image, video", async () => {
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "transient_failure", latencyMs: 700, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "transient_failure", latencyMs: 100, sentAt: AT });
    seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "timestamps", providerId: "align-a", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });

    expect(failuresReport(PERIOD).stages.map((row) => row.stage)).toEqual(["voice", "alignment", "reasoning", "image", "video"]);
  });

  it("lists no stage when every attempt succeeded and none was a manual retry", () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "late-success" });
    expect(failuresReport(PERIOD).stages).toEqual([]);
  });

  it("counts only the attempts sent in the period", () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: "2026-08-01T10:00:00.000Z", outcome: "transient" });
    expect(stageRow("voice")).toMatchObject({ transient: 1 });
  });

  it("agrees with the provider-usage report for every stage", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "voice-over", providerId: "voice-b", sentAt: AT, outcome: "not-retryable" });
    seedAttempt({ stage: "voice-over", providerId: "voice-b", sentAt: AT, outcome: "timed-out" });
    seedAttempt({ stage: "timestamps", providerId: "elevenlabs-native", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "superseded" });
    const { sceneIds } = await registerScenes([7, 8]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    bindScene(sceneIds[1]!, { provider: "img-b", videoProvider: "vid-b" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "transient_failure", latencyMs: 100, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[1]!, stage: "image", mode: "not_retryable_failure", latencyMs: 100, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[1]!, stage: "video", mode: "flaky", latencyMs: 100, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "transient_failure", latencyMs: 100, sentAt: AT });

    const usage = providerUsageReport(PERIOD).rows;
    for (const row of failuresReport(PERIOD).stages) {
      const rows = usage.filter((candidate) => candidate.stage === row.stage);
      expect(row.transient).toBe(rows.reduce((total, candidate) => total + candidate.transient, 0));
      expect(row.notRetryable).toBe(rows.reduce((total, candidate) => total + candidate.notRetryable, 0));
      expect(row.timedOut).toBe(rows.reduce((total, candidate) => total + candidate.timedOut, 0));
    }
    expect(failuresReport(PERIOD).stages.map((row) => row.stage)).toEqual(["voice", "image", "video"]);
  });
});

describe("failuresReport — exhausted budgets and manual retries", () => {
  it("counts a cycle whose last allowed attempt ended transient or timed out as one exhausted budget", () => {
    const runId = newRun("Budget", "x".repeat(28));
    for (const outcome of ["transient", "transient", "transient", "timed-out"] as const) seedAttempt({ runId, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome });
    expect(stageRow("voice")).toMatchObject({ transient: 3, timedOut: 1, budgetsExhausted: 1, manualRetries: 0 });
  });

  it("does not count a cycle that ended before the last allowed attempt, or whose last attempt succeeded or was not retryable", () => {
    const early = newRun("Early", "x".repeat(28));
    seedAttempt({ runId: early, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    const recovered = newRun("Recovered", "x".repeat(28));
    for (const outcome of ["transient", "transient", "transient", "success"] as const) seedAttempt({ runId: recovered, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome });
    const refused = newRun("Refused", "x".repeat(28));
    for (const outcome of ["transient", "transient", "transient", "not-retryable"] as const) seedAttempt({ runId: refused, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome });
    expect(stageRow("voice")).toMatchObject({ budgetsExhausted: 0 });
  });

  it("counts attempts started by a manual retry, and places one that was never sent by the instant it was queued", () => {
    const runId = newRun("Manual", "x".repeat(28));
    seedAttempt({ runId, stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "success", trigger: "initial", cycle: 1 });
    seedAttempt({ runId, stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "success", trigger: "manual", cycle: 2 });
    seedAttempt({ runId, stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "scheduled", trigger: "manual", cycle: 3 });
    seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: "2026-08-01T10:00:00.000Z", outcome: "scheduled", trigger: "manual" });
    expect(stageRow("reasoning")).toMatchObject({ manualRetries: 2, budgetsExhausted: 0, transient: 0 });
  });

  it("reports both values as not recorded for the scene stages", async () => {
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "transient_failure", latencyMs: 100, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "transient_failure", latencyMs: 100, sentAt: AT });
    expect(stageRow("image")).toMatchObject({ budgetsExhausted: null, manualRetries: null });
    expect(stageRow("video")).toMatchObject({ budgetsExhausted: null, manualRetries: null });
  });
});

describe("failuresReport — failure wordings of the session-level stages", () => {
  const wordings = (stage: string) => failuresReport(PERIOD).wordings.filter((entry) => entry.stage === stage);

  it("groups the wordings of failed attempts, most frequent first and then alphabetically", () => {
    for (let i = 0; i < 5; i += 1) seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", errorMessage: "The voice provider answered HTTP 503." });
    for (let i = 0; i < 2; i += 1) seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "not-retryable", errorMessage: "The voice provider refused the voice." });
    for (let i = 0; i < 2; i += 1) seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "timed-out", errorMessage: "A tie that sorts first." });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    expect(wordings("voice")).toEqual([
      { stage: "voice", message: "The voice provider answered HTTP 503.", attempts: 5 },
      { stage: "voice", message: "A tie that sorts first.", attempts: 2 },
      { stage: "voice", message: "The voice provider refused the voice.", attempts: 2 },
    ]);
  });

  it("keeps at most five wordings per stage", () => {
    for (let i = 1; i <= 7; i += 1) {
      for (let n = 0; n < i; n += 1) seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "transient", errorMessage: `Wording ${i}` });
    }
    expect(wordings("reasoning").map((entry) => entry.message)).toEqual(["Wording 7", "Wording 6", "Wording 5", "Wording 4", "Wording 3"]);
  });

  it("lists no wording for a failed attempt without one or outside the period", () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: "2026-08-01T10:00:00.000Z", outcome: "transient", errorMessage: "Too old." });
    expect(failuresReport(PERIOD).wordings).toEqual([]);
  });

  it("never lists a wording of the image or video stage", async () => {
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 700, sentAt: AT });
    db.prepare("UPDATE scenes SET last_error = 'provider words' WHERE id = ?").run(sceneIds[0]!);
    expect(failuresReport(PERIOD).wordings).toEqual([]);
  });
});

describe("failuresReport — scenes failed now", () => {
  it("splits the scenes failed now by the stage that failed, whatever the period", async () => {
    const { runId, sceneIds } = await registerScenes([7, 8, 9]);
    failImage(sceneIds[0]!);
    failVideo(runId, sceneIds[1]!);
    failVideo(runId, sceneIds[2]!);
    expect(failuresReport(PERIOD).failedScenesNow).toEqual({ image: 1, video: 2 });
    expect(failuresReport({ from: "2020-01-01T00:00:00.000Z", to: "2020-01-02T00:00:00.000Z" }).failedScenesNow).toEqual({ image: 1, video: 2 });
  });

  it("does not count scenes that are not failed", async () => {
    await registerScenes([7]);
    expect(failuresReport(PERIOD).failedScenesNow).toEqual({ image: 0, video: 0 });
  });
});

describe("failuresReport — what it never contains", () => {
  it("holds neither the text of a scene's failure nor the script, however the report is serialized", async () => {
    const { runId, sceneIds } = await registerScenes([7]);
    failVideo(runId, sceneIds[0]!);
    db.prepare("UPDATE scenes SET last_error = 'MARKER-SCENE-FAILURE' WHERE id = ?").run(sceneIds[0]!);
    const scriptRun = newRun("Marker session", "MARKER-SCRIPT the lighthouse stands alone.");
    seedAttempt({ runId: scriptRun, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 700, sentAt: AT });

    const body = JSON.stringify(failuresReport(PERIOD));
    expect(body).not.toContain("MARKER-SCENE-FAILURE");
    expect(body).not.toContain("MARKER-SCRIPT");
    expect(body).toContain('"video"');
  });

  it("writes nothing", () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", errorMessage: "x" });
    const count = () => (db.prepare("SELECT (SELECT COUNT(*) FROM stage_attempts) + (SELECT COUNT(*) FROM scenes) + (SELECT COUNT(*) FROM runs) AS n").get() as unknown as { n: number }).n;
    const before = count();
    failuresReport(PERIOD);
    expect(count()).toBe(before);
  });
});
