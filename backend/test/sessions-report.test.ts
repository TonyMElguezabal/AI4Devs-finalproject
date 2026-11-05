import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeStageAttempt, db, rebindFailedClip, recordStageAttempt, resetAll } from "../src/db.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { sessionScenesReport, sessionsReport } from "../src/sessionsReport.ts";
import { failVideo, installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, plusMs, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";
import { seedSession } from "./sessionsReportFixtures.ts";

// report-sessions (JOS-225), tasks 2.1–2.2 — design Decisions 2–5: one row per session created in the period, and its scenes.

const CREATED = "2026-10-05T10:00:00.000Z";

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
});

afterEach(() => removeTwoProvidersPerStage());

const list = (period: { from?: string; to: string } = PERIOD) => sessionsReport(period).rows;
const rowOf = (runId: string) => list().find((row) => row.id === runId)!;

describe("sessionsReport — which sessions, in which order", () => {
  it("lists only the sessions created in [from, to), newest first", () => {
    const old = seedSession({ title: "Old", createdAt: "2026-08-01T10:00:00.000Z" });
    const first = seedSession({ title: "First", createdAt: "2026-10-03T10:00:00.000Z" });
    const second = seedSession({ title: "Second", createdAt: "2026-10-04T10:00:00.000Z" });
    const atEnd = seedSession({ title: "At the end", createdAt: PERIOD.to });
    expect(list().map((row) => row.id)).toEqual([second, first]);
    expect(list({ to: "2027-01-01T00:00:00.000Z" }).map((row) => row.id)).toEqual([atEnd, second, first, old]);
  });

  it("lists a session with no scenes", () => {
    const id = seedSession({ createdAt: CREATED });
    expect(rowOf(id)).toMatchObject({ scenes: 0, failedScenes: 0, attempts: 0 });
  });
});

describe("sessionsReport — state", () => {
  it("is in progress with no failure and no successful assembly", () => {
    const id = seedSession({ createdAt: CREATED, voiceOverAfter: 5 });
    expect(rowOf(id)).toMatchObject({ state: "in-progress", failedPhase: null, secondsToFinalVideo: null });
  });

  it("is final-video-ready after a successful assembly attempt", () => {
    const id = seedSession({ createdAt: CREATED, voiceOverAfter: 0.1, assemblyAfter: 18.1 });
    expect(rowOf(id)).toMatchObject({ state: "final-video-ready", failedPhase: null, secondsToVoiceOver: 0.1, secondsToFinalVideo: 18.1 });
  });

  it("is failed with its phase whichever phase failed", () => {
    for (const phase of ["voice-over", "decomposition", "assembly"] as const) {
      const id = seedSession({ createdAt: CREATED, failure: phase });
      expect(rowOf(id)).toMatchObject({ state: "failed", failedPhase: phase });
    }
  });

  it("lets a failure win over a successful assembly", () => {
    const id = seedSession({ createdAt: CREATED, voiceOverAfter: 5, assemblyAfter: 30, failure: "assembly" });
    expect(rowOf(id)).toMatchObject({ state: "failed", failedPhase: "assembly", secondsToVoiceOver: 5, secondsToFinalVideo: 30 });
  });

  it("reports paused apart from the state", () => {
    const paused = seedSession({ createdAt: CREATED, voiceOverAfter: 5, assemblyAfter: 20, paused: true });
    const running = seedSession({ createdAt: CREATED, voiceOverAfter: 5, assemblyAfter: 20 });
    expect(rowOf(paused)).toMatchObject({ paused: true, state: "final-video-ready" });
    expect(rowOf(running)).toMatchObject({ paused: false });
  });

  it("keeps a failed session's voice-over time and leaves the missing times null", () => {
    const kept = seedSession({ createdAt: CREATED, voiceOverAfter: 12, failure: "assembly" });
    const early = seedSession({ createdAt: CREATED, failure: "voice-over" });
    expect(rowOf(kept)).toMatchObject({ secondsToVoiceOver: 12, secondsToFinalVideo: null });
    expect(rowOf(early)).toMatchObject({ scenes: 0, secondsToVoiceOver: null, secondsToFinalVideo: null });
  });

  it("rounds seconds to one decimal and uses the latest successful assembly", () => {
    const id = seedSession({ createdAt: CREATED, voiceOverAfter: 1.26, assemblyAfter: 10 });
    const rebuiltAt = plusMs(CREATED, 40_000);
    const rebuild = recordStageAttempt({ runId: id, stage: "assembly", providerId: null, queuedAt: rebuiltAt, sentAt: rebuiltAt });
    completeStageAttempt(rebuild.id, { outcome: "success", finishedAt: plusMs(CREATED, 41_240) });
    expect(rowOf(id)).toMatchObject({ secondsToVoiceOver: 1.3, secondsToFinalVideo: 41.2 });
  });
});

describe("sessionsReport — counts", () => {
  it("counts scenes, failed scenes and every attempt of the session", async () => {
    const { runId, sceneIds } = await registerScenes([7, 8]);
    db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run(CREATED, runId);
    db.prepare("UPDATE scenes SET status = 'failed' WHERE id = ?").run(sceneIds[1]!);
    seedAttempt({ runId, stage: "voice-over", providerId: "voice-a", sentAt: CREATED, outcome: "success" });
    seedAttempt({ runId, stage: "voice-over", providerId: "voice-a", sentAt: CREATED, outcome: "transient" });
    seedAttempt({ runId, stage: "timestamps", providerId: "align-a", sentAt: CREATED, outcome: "success" });
    seedAttempt({ runId, stage: "decomposition", providerId: "llm-a", sentAt: CREATED, outcome: "success" });
    seedAttempt({ runId, stage: "decomposition", providerId: "llm-a", sentAt: CREATED, outcome: "scheduled" });
    for (let i = 0; i < 4; i += 1) seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 10, sentAt: CREATED });
    for (let i = 0; i < 3; i += 1) seedSceneAttempt({ sceneId: sceneIds[1]!, stage: "video", mode: "transient_failure", latencyMs: 10, sentAt: CREATED });

    expect(rowOf(runId)).toMatchObject({ scenes: 2, failedScenes: 1, attempts: 11 });
  });
});

describe("sessionScenesReport", () => {
  it("returns null for an unknown session and no rows for a session without scenes", () => {
    expect(sessionScenesReport("no-such-session")).toBeNull();
    expect(sessionScenesReport(seedSession({ createdAt: CREATED }))).toEqual({ sessionId: expect.any(String), rows: [] });
  });

  it("lists the scenes in order with status, providers, request counts, duration, speed factor and warnings", async () => {
    insertProfile({ id: "img-a", stage: "image", adapterType: "stub", label: "Image A", parameters: {} }, CREATED);
    const { runId, sceneIds } = await registerScenes([7, 8]);
    bindScene(sceneIds[0]!, { provider: "img-a" });
    // The duration and speed values are locked once a scene is registered; a move of a failed clip is the one writer (JOS-172).
    failVideo(runId, sceneIds[0]!, "stub-a");
    rebindFailedClip(sceneIds[0]!, "stub-a", "vid-unlabelled", { requestedDurationSeconds: 7, durationWarning: "exceeds-maximum", speedFactor: 1.5, speedFactorWarning: "exceeds-limit" });
    for (let i = 0; i < 2; i += 1) seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 10, sentAt: CREATED });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "success", latencyMs: 10, sentAt: CREATED });

    const rows = sessionScenesReport(runId)!.rows;

    expect(rows.map((row) => row.number)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      imageProvider: "Image A",
      clipProvider: "vid-unlabelled",
      imageAttempts: 2,
      clipAttempts: 1,
      requestedDurationSeconds: 7,
      speedFactor: 1.5,
      durationWarning: "exceeds-maximum",
      speedFactorWarning: "exceeds-limit",
    });
    expect(rows[1]).toMatchObject({ imageProvider: null, clipProvider: null, imageAttempts: 0, clipAttempts: 0, durationWarning: null, speedFactorWarning: null });
  });
});
