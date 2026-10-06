import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRun, resetAll, setRunPaused } from "../src/db.ts";
import {
  admitLaunch,
  checkCompleteness,
  NOT_YET_LAUNCHABLE,
  PIPELINE_STAGES,
  registerStageLauncher,
  resetRegistry,
  sessionHeldWork,
  type HeldWorkResult,
  type PipelineStage,
} from "../src/launchGate.ts";

// ---- admitLaunch (design Decision 1) -----------------------------------

describe("admitLaunch", () => {
  beforeEach(() => {
    resetAll();
    resetRegistry();
  });

  afterEach(() => {
    resetRegistry();
  });

  it("admits a session that is not paused", () => {
    const runId = randomUUID();
    createRun(runId, "title", "script", "en");

    expect(admitLaunch(runId)).toEqual({ admitted: true });
  });

  it("holds a paused session with reason session-paused", () => {
    const runId = randomUUID();
    createRun(runId, "title", "script", "en");
    setRunPaused(runId, true);

    expect(admitLaunch(runId)).toEqual({ admitted: false, reason: "session-paused" });
  });

  it("holds again after a second pause (idempotent hold)", () => {
    const runId = randomUUID();
    createRun(runId, "title", "script", "en");
    setRunPaused(runId, true);

    expect(admitLaunch(runId).admitted).toBe(false);
    expect(admitLaunch(runId).admitted).toBe(false);
  });

  it("does not admit an unknown session", () => {
    const result = admitLaunch(randomUUID());
    expect(result.admitted).toBe(false);
  });
});

// ---- launcher registry (design Decisions 3 and 10) --------------------

describe("launcher registry", () => {
  beforeEach(() => {
    resetAll();
    resetRegistry();
  });

  afterEach(() => {
    resetRegistry();
  });

  it("PIPELINE_STAGES lists stages in pipeline order", () => {
    expect(PIPELINE_STAGES).toEqual([
      "voice-over",
      "decomposition",
      "image",
      "video",
      "assembly",
    ]);
  });

  it("registering a stage twice is refused", () => {
    const launcher = {
      stage: "image" as PipelineStage,
      heldWork: (_sessionId: string): HeldWorkResult => ({ count: 0, sceneIds: [] }),
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: (_sessionId: string) => {},
    };
    registerStageLauncher(launcher);
    expect(() => registerStageLauncher(launcher)).toThrow("already has a registered launcher");
  });

  it("sessionHeldWork returns stages in pipeline order regardless of registration order", () => {
    const runId = randomUUID();
    createRun(runId, "title", "script", "en");
    setRunPaused(runId, true);

    // Register in reverse pipeline order (video, decomposition)
    registerStageLauncher({
      stage: "video",
      heldWork: (sid) => sid === runId ? { count: 1, sceneIds: [] } : { count: 0, sceneIds: [] },
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: () => {},
    });
    registerStageLauncher({
      stage: "decomposition",
      heldWork: (sid) => sid === runId ? { count: 1, sceneIds: [] } : { count: 0, sceneIds: [] },
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: () => {},
    });

    const { stages } = sessionHeldWork(runId);
    expect(stages.map((s) => s.stage)).toEqual(["decomposition", "video"]);
  });

  it("completeness check passes when every stage is in exactly one place", () => {
    // After resetRegistry, all stages are in NOT_YET_LAUNCHABLE
    const result = checkCompleteness();
    expect(result.ok).toBe(true);
  });

  it("completeness check fails when a stage is in neither registry nor NOT_YET_LAUNCHABLE", () => {
    NOT_YET_LAUNCHABLE.delete("video");
    const result = checkCompleteness();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes("video") && i.includes("neither"))).toBe(true);
    NOT_YET_LAUNCHABLE.add("video");
  });

  it("completeness check fails when a stage is in both registry and NOT_YET_LAUNCHABLE", () => {
    registerStageLauncher({
      stage: "image",
      heldWork: () => ({ count: 0, sceneIds: [] }),
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: () => {},
    });
    // Manually add back to NOT_YET_LAUNCHABLE to create the bad state
    NOT_YET_LAUNCHABLE.add("image");
    const result = checkCompleteness();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes("image") && i.includes("both"))).toBe(true);
  });
});

// ---- sessionHeldWork (design Decision 7) --------------------------------

describe("sessionHeldWork", () => {
  beforeEach(() => {
    resetAll();
    resetRegistry();
  });

  afterEach(() => {
    resetRegistry();
  });

  it("returns empty when session is not paused", () => {
    const runId = randomUUID();
    createRun(runId, "title", "script", "en");

    registerStageLauncher({
      stage: "image",
      heldWork: () => ({ count: 1, sceneIds: ["scene-1"] }),
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: () => {},
    });

    const result = sessionHeldWork(runId);
    expect(result.stages).toHaveLength(0);
    expect(result.sceneIds.size).toBe(0);
  });

  it("returns empty for an unknown session", () => {
    const result = sessionHeldWork(randomUUID());
    expect(result.stages).toHaveLength(0);
  });

  it("returns held stages and scene IDs when paused", () => {
    const runId = randomUUID();
    createRun(runId, "title", "script", "en");
    setRunPaused(runId, true);

    const sceneId1 = randomUUID();
    const sceneId2 = randomUUID();

    registerStageLauncher({
      stage: "image",
      heldWork: (sid) =>
        sid === runId ? { count: 2, sceneIds: [sceneId1, sceneId2] } : { count: 0, sceneIds: [] },
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: () => {},
    });

    const result = sessionHeldWork(runId);
    expect(result.stages).toEqual([{ stage: "image", count: 2 }]);
    expect(result.sceneIds.has(sceneId1)).toBe(true);
    expect(result.sceneIds.has(sceneId2)).toBe(true);
  });

  it("skips stages with count 0 in the held list", () => {
    const runId = randomUUID();
    createRun(runId, "title", "script", "en");
    setRunPaused(runId, true);

    registerStageLauncher({
      stage: "image",
      heldWork: () => ({ count: 0, sceneIds: [] }),
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: () => {},
    });
    registerStageLauncher({
      stage: "video",
      heldWork: (sid) => sid === runId ? { count: 1, sceneIds: [] } : { count: 0, sceneIds: [] },
      settleInFlight: () => ({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 }), launch: () => {},
    });

    const { stages } = sessionHeldWork(runId);
    expect(stages.map((s) => s.stage)).toEqual(["video"]);
  });
});
