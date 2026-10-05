import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createRun, getStageAttempts, resetAll, scheduleStageAttempt, setRunPaused } from "../src/db.ts";
import {
  armScheduledAttempt,
  rebuildScheduler,
  registerAttemptSender,
  releaseAttempt,
  releaseSessionAttempts,
  resetScheduler,
} from "../src/retry/retryScheduler.ts";
import type { StageAttempt } from "../src/types.ts";

// bounded-retry-policy (JOS-184), group 4 — the scheduler releases due retries
// through the phase-launch gate, claims each exactly once, and rebuilds from the
// store after a restart. Image is used as the stage: it has no launcher of its
// own yet, so these tests exercise the scheduler alone.

const NOW = new Date("2026-10-04T10:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString();
const clock = () => NOW;
const LONG_AGO = "2020-01-01T00:00:00.000Z"; // due for any real clock

let sent: StageAttempt[];

beforeEach(() => {
  resetAll();
  resetScheduler();
  sent = [];
  registerAttemptSender("image", (attempt) => {
    sent.push(attempt);
  });
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "scheduler test", "A short script.", "en");
  return runId;
}

function scheduleRetry(runId: string, dueInSeconds = 0, sceneId = "scene-1") {
  return scheduleStageAttempt({ runId, stage: "image", sceneId, providerId: "bound-image-provider", queuedAt: at(0), dueAt: at(dueInSeconds), trigger: "automatic" });
}

describe("A due retry", () => {
  it("is claimed and sent in flight, with its send time recorded", () => {
    const runId = newRunId();
    const retry = scheduleRetry(runId);

    expect(releaseAttempt(retry.id, clock)).toBe("sent");

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ id: retry.id, outcome: "in-flight", sentAt: NOW.toISOString() });
    expect(getStageAttempts(runId, "image")[0]?.outcome).toBe("in-flight");
  });

  it("is not sent before it is due", () => {
    const retry = scheduleRetry(newRunId(), 30);

    expect(releaseAttempt(retry.id, clock)).toBe("not-due");

    expect(sent).toHaveLength(0);
    expect(getStageAttempts(retry.runId, "image")[0]?.outcome).toBe("scheduled");
  });

  it("is sent when its timer fires, without anyone asking", async () => {
    const retry = scheduleRetry(newRunId());

    armScheduledAttempt(retry, () => new Date(Date.parse(retry.dueAt ?? "")));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sent.map((attempt) => attempt.id)).toEqual([retry.id]);
  });

  it("is never sent twice: a second release of the same attempt is a no-op", () => {
    const retry = scheduleRetry(newRunId());

    const results = [releaseAttempt(retry.id, clock), releaseAttempt(retry.id, clock)];

    expect(results).toEqual(["sent", "gone"]);
    expect(sent).toHaveLength(1);
  });

  it("is dropped quietly when its session no longer exists", () => {
    const retry = scheduleRetry(newRunId());
    resetAll();

    expect(releaseAttempt(retry.id, clock)).toBe("gone");
    expect(sent).toHaveLength(0);
  });
});

describe("A due retry in a paused session (the phase-launch gate)", () => {
  it("is held while the session is paused and stays scheduled", () => {
    const runId = newRunId();
    const retry = scheduleRetry(runId);
    setRunPaused(runId, true);

    expect(releaseAttempt(retry.id, clock)).toBe("held");

    expect(sent).toHaveLength(0);
    expect(getStageAttempts(runId, "image")[0]?.outcome).toBe("scheduled");
  });

  it("is sent once the session continues", () => {
    const runId = newRunId();
    const retry = scheduleRetry(runId);
    setRunPaused(runId, true);
    releaseAttempt(retry.id, clock);
    setRunPaused(runId, false);

    expect(releaseSessionAttempts(runId, clock)).toBe(1);

    expect(sent.map((attempt) => attempt.id)).toEqual([retry.id]);
  });

  it("leaves an attempt that is not yet due to its own timer when the session continues", () => {
    const runId = newRunId();
    scheduleRetry(runId, 30);

    expect(releaseSessionAttempts(runId, clock)).toBe(0);

    expect(sent).toHaveLength(0);
  });
});

describe("A restart with a scheduled attempt (Decision 9)", () => {
  it("rebuilds from the store and sends it exactly once, even if the rebuild runs twice", async () => {
    const retry = scheduleStageAttempt({ runId: newRunId(), stage: "image", sceneId: "scene-1", providerId: "bound-image-provider", queuedAt: LONG_AGO, dueAt: LONG_AGO, trigger: "automatic" });
    resetScheduler(); // the process died: every timer is gone, the record is not

    expect(rebuildScheduler()).toBe(1);
    expect(rebuildScheduler()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sent.map((attempt) => attempt.id)).toEqual([retry.id]);
  });

  it("sends nothing for an attempt that was already in flight or finished", async () => {
    const retry = scheduleStageAttempt({ runId: newRunId(), stage: "image", sceneId: "scene-1", providerId: "bound-image-provider", queuedAt: LONG_AGO, dueAt: LONG_AGO, trigger: "automatic" });
    releaseAttempt(retry.id);
    sent = [];

    rebuildScheduler();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sent).toHaveLength(0);
  });
});

describe("A retry re-runs only its own stage instance", () => {
  it("hands the sender the attempt's scene and bound provider, and leaves another scene's attempts alone", () => {
    const runId = newRunId();
    const other = scheduleStageAttempt({ runId, stage: "image", sceneId: "scene-2", providerId: "other-provider", queuedAt: at(0), dueAt: at(60), trigger: "automatic" });
    const retry = scheduleRetry(runId, 0, "scene-1");

    releaseAttempt(retry.id, clock);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ sceneId: "scene-1", providerId: "bound-image-provider", stageInstanceKey: `${runId}:scene-1:image` });
    expect(getStageAttempts(runId, "image").find((attempt) => attempt.id === other.id)).toMatchObject({ outcome: "scheduled", providerId: "other-provider" });
  });
});
