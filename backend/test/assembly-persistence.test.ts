import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRun,
  getRun,
  getStageAttempts,
  recordStageAttempt,
  resetAll,
  setFinalVideoPath,
} from "../src/db.ts";

// assemble-final-video (JOS-149), group 3 — persistence for Session.final_video_path
// and the assembly StageExecution row (design.md Decision 5).

beforeEach(() => {
  resetAll();
});

// ---- Task 3.1 — Session.final_video_path is nullable until success ----

describe("Task 3.1 — Session.final_video_path", () => {
  it("is null when the session is created", () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Some script.", "en");
    const run = getRun(runId);
    expect(run).toBeDefined();
    expect(run!.finalVideoPath).toBeNull();
  });

  it("can be set to a relative path after assembly succeeds", () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Some script.", "en");
    setFinalVideoPath(runId, "final-video.mp4");
    const run = getRun(runId);
    expect(run!.finalVideoPath).toBe("final-video.mp4");
  });
});

// ---- Task 3.2 — assembly StageExecution row with nullable provider ----

describe("Task 3.2 — assembly stage attempt has nullable provider_id", () => {
  it("can insert an assembly stage attempt with null provider", () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Some script.", "en");
    const now = new Date().toISOString();
    const attempt = recordStageAttempt({
      runId,
      stage: "assembly",
      providerId: null,
      queuedAt: now,
      sentAt: now,
    });
    expect(attempt.runId).toBe(runId);
    expect(attempt.stage).toBe("assembly");
    expect(attempt.providerId).toBeNull();
    expect(attempt.outcome).toBe("in-flight");
    expect(attempt.attemptNumber).toBe(1);
  });

  it("retrieves the assembly attempt with getStageAttempts", () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Some script.", "en");
    const now = new Date().toISOString();
    recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: now, sentAt: now });
    const attempts = getStageAttempts(runId, "assembly");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.stage).toBe("assembly");
    expect(attempts[0]!.providerId).toBeNull();
  });

  it("numbers subsequent assembly attempts sequentially", () => {
    const runId = randomUUID();
    createRun(runId, "Test", "Some script.", "en");
    const now = new Date().toISOString();
    recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: now, sentAt: now });
    recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: now, sentAt: now });
    const attempts = getStageAttempts(runId, "assembly");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.attemptNumber).toBe(1);
    expect(attempts[1]!.attemptNumber).toBe(2);
  });
});
