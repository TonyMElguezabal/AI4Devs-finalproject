import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo, completeStageAttempt, getPhaseInstants, insertVoiceOver, markChunkComplete, recordStageAttempt, resetAll, scheduleStageAttempt, setFinalVideoPath, stampPhase } from "../src/db.ts";
import { installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";

// record-phase-instants-and-pipeline-report (JOS-228), groups 2 and 3 — design Decisions 1–3: migration 22 creates
// `phase_instants`; every phase boundary stamps its instant once.

const T = (second: number) => `2026-10-26T10:00:${String(second).padStart(2, "0")}.000Z`;

describe("migration 22", () => {
  it("creates phase_instants without rows and changes no other table", () => {
    const target = new DatabaseSync(":memory:");
    target.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '', provider TEXT);
    `);
    applyMigrationsTo(target, 21);
    target.prepare("INSERT INTO runs (id, title, created_at) VALUES ('r1', 'Old session', '2026-10-01T00:00:00.000Z')").run();
    const before = target.prepare("SELECT * FROM runs").all();

    applyMigrationsTo(target, 22); // only this migration is under test; a later one may add columns to runs

    expect(target.prepare("SELECT COUNT(*) c FROM phase_instants").get()).toEqual({ c: 0 });
    expect(target.prepare("SELECT * FROM runs").all()).toEqual(before);
  });
});

describe("stampPhase", () => {
  beforeEach(() => resetAll());

  it("keeps the first start and the first end", () => {
    const runId = newRun();
    stampPhase(runId, "voice-over", "started", T(1));
    stampPhase(runId, "voice-over", "started", T(5));
    stampPhase(runId, "voice-over", "ended", T(9));
    stampPhase(runId, "voice-over", "ended", T(20));
    expect(getPhaseInstants(runId)["voice-over"]).toEqual({ startedAt: T(1), endedAt: T(9) });
  });

  it("stores an end that has no start", () => {
    const runId = newRun();
    stampPhase(runId, "scenes", "ended", T(3));
    expect(getPhaseInstants(runId).scenes).toEqual({ startedAt: null, endedAt: T(3) });
  });

  it("reports nothing for a phase never stamped", () => {
    expect(getPhaseInstants(newRun())).toEqual({});
  });
});

describe("phase boundaries are stamped by the real write paths", () => {
  beforeEach(() => {
    resetAll();
    installTwoProvidersPerStage();
  });
  afterEach(() => removeTwoProvidersPerStage());

  it("stamps all four phases of a session that runs end to end, each start not after its end", async () => {
    const { runId, sceneIds } = await registerScenes([8, 8]);
    const voice = recordStageAttempt({ runId, stage: "voice-over", providerId: "stub-a", queuedAt: T(1), sentAt: T(1) });
    completeStageAttempt(voice.id, { outcome: "success", finishedAt: T(5) });
    insertVoiceOver({ runId, audioPath: "v.mp3", timestampsPath: null, durationSeconds: 8, sizeBytes: 1, nativeTimestampsAvailable: false, providerRequestId: null, completedAt: T(5) });
    recordStageAttempt({ runId, stage: "timestamps", providerId: "stub-a", queuedAt: T(6), sentAt: T(6) });
    for (const sceneId of sceneIds) markChunkComplete(sceneId, "clip.mp4");
    recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: T(30), sentAt: T(30) });
    setFinalVideoPath(runId, "final-video.mp4");

    const instants = getPhaseInstants(runId);
    expect(Object.keys(instants).sort()).toEqual(["assembly", "decomposition", "scenes", "voice-over"]);
    for (const { startedAt, endedAt } of Object.values(instants)) {
      expect(startedAt).not.toBeNull();
      expect(endedAt).not.toBeNull();
      expect(startedAt! <= endedAt!).toBe(true);
    }
    expect(instants["voice-over"]).toEqual({ startedAt: T(1), endedAt: T(5) });
    expect(instants.decomposition?.startedAt).toBe(T(6));
    expect(instants.assembly?.startedAt).toBe(T(30));
  });

  it("starts the scenes phase at scene registration, which is also where the decomposition ends", async () => {
    const { runId } = await registerScenes([8]);
    const { decomposition, scenes } = getPhaseInstants(runId);
    expect(scenes?.startedAt).toBe(decomposition?.endedAt);
    expect(scenes?.endedAt).toBeNull();
  });

  it("ends the scenes phase only when the last scene completes", async () => {
    const { runId, sceneIds } = await registerScenes([8, 8, 8]);
    markChunkComplete(sceneIds[0]!, "a.mp4");
    markChunkComplete(sceneIds[1]!, "b.mp4");
    expect(getPhaseInstants(runId).scenes?.endedAt).toBeNull();
    markChunkComplete(sceneIds[2]!, "c.mp4");
    expect(getPhaseInstants(runId).scenes?.endedAt).not.toBeNull();
  });

  it("keeps the first attempt's start when the voice-over is retried", () => {
    const runId = newRun();
    const first = recordStageAttempt({ runId, stage: "voice-over", providerId: "stub-a", queuedAt: T(1), sentAt: T(1) });
    completeStageAttempt(first.id, { outcome: "transient", finishedAt: T(2) });
    recordStageAttempt({ runId, stage: "voice-over", providerId: "stub-a", queuedAt: T(3), sentAt: T(3) });
    expect(getPhaseInstants(runId)["voice-over"]?.startedAt).toBe(T(1));
  });

  it("leaves the assembly instants unchanged when the final video is recorded again", () => {
    const runId = newRun();
    recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: T(1), sentAt: T(1) });
    setFinalVideoPath(runId, "final-video.mp4");
    const before = getPhaseInstants(runId).assembly;
    setFinalVideoPath(runId, "other.mp4");
    expect(getPhaseInstants(runId).assembly).toEqual(before);
  });

  it("starts a phase at the queue time of a scheduled attempt that has not been sent", () => {
    const runId = newRun();
    scheduleStageAttempt({ runId, stage: "decomposition", providerId: "stub-a", queuedAt: T(2), dueAt: T(4) });
    expect(getPhaseInstants(runId).decomposition?.startedAt).toBe(T(2));
  });
});
