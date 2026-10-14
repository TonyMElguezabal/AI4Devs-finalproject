import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createRun, getStageAttempts, resetAll, scheduleStageAttempt, setRunPaused } from "../src/db.ts";
import * as concurrency from "../src/concurrency.ts";
import {
  armScheduledAttempt,
  rebuildScheduler,
  registerAttemptSender,
  registerSlotKeyResolver,
  releaseAttempt,
  releaseSessionAttempts,
  resetScheduler,
  sendWithSlot,
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

// limit-provider-requests-per-stage (JOS-167), design Decisions 3-6 — a
// session-level attempt takes a slot of its stage before it is claimed.

describe("sendWithSlot", () => {
  const gate = () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { open, opened };
  };
  const scheduleVoice = (runId = newRunId(), queuedAt = at(0)) =>
    scheduleStageAttempt({ runId, stage: "voice-over", providerId: "voice-1", queuedAt, dueAt: queuedAt, trigger: "initial" });
  const outcomeOf = (attempt: StageAttempt) => getStageAttempts(attempt.runId, "voice-over")[0]!;

  beforeEach(() => {
    concurrency.resetAll();
    concurrency.setLimit("voice", 1);
  });

  it("leaves a second attempt scheduled, with no send time, until the first one's call returns", async () => {
    const first = scheduleVoice();
    const second = scheduleVoice();
    const firstCall = gate();
    const started: string[] = [];
    const run = (attempt: StageAttempt) => async () => {
      started.push(attempt.id);
      if (attempt.id === first.id) await firstCall.opened;
    };

    const a = sendWithSlot(first.id, run(first), clock);
    const b = sendWithSlot(second.id, run(second), () => new Date(NOW.getTime() + 5000));
    expect(started).toEqual([first.id]);
    expect(outcomeOf(second)).toMatchObject({ outcome: "scheduled", sentAt: null });

    firstCall.open();
    await a;
    expect(await b).toMatchObject({ sent: true });
    expect(started).toEqual([first.id, second.id]);
    expect(outcomeOf(second)).toMatchObject({ outcome: "in-flight", sentAt: at(5) });
  });

  it("sends in the order the attempts became ready, across sessions", async () => {
    const holder = scheduleVoice();
    const hold = gate();
    const order: string[] = [];
    const a = sendWithSlot(holder.id, () => hold.opened, clock);
    const waiting = [scheduleVoice(), scheduleVoice(), scheduleVoice()];
    const results = waiting.map((attempt) => sendWithSlot(attempt.id, () => void order.push(attempt.id), clock));

    hold.open();
    await a;
    await Promise.all(results);

    expect(order).toEqual(waiting.map((attempt) => attempt.id));
  });

  it("releases the slot and leaves the attempt scheduled when the session is paused while it waits", async () => {
    const holder = scheduleVoice();
    const hold = gate();
    const waitingRun = newRunId();
    const waiting = scheduleVoice(waitingRun);
    const after = scheduleVoice();
    const sentIds: string[] = [];
    const a = sendWithSlot(holder.id, () => hold.opened, clock);
    const b = sendWithSlot(waiting.id, () => void sentIds.push(waiting.id), clock);
    const c = sendWithSlot(after.id, () => void sentIds.push(after.id), clock);
    setRunPaused(waitingRun, true);

    hold.open();
    await a;

    expect(await b).toEqual({ sent: false, reason: "held" });
    await c;
    expect(sentIds).toEqual([after.id]);
    expect(outcomeOf(waiting)).toMatchObject({ outcome: "scheduled", sentAt: null });
    expect(concurrency.stats("voice")).toMatchObject({ inFlight: 0, queued: 0 });
  });

  it("sends once when a timer and a continue release the same waiting attempt", async () => {
    const holder = scheduleVoice();
    const hold = gate();
    const waiting = scheduleVoice();
    const sentIds: string[] = [];
    registerAttemptSender("voice-over", (attempt) => void sentIds.push(attempt.id));
    const a = sendWithSlot(holder.id, () => hold.opened, clock);

    expect([releaseAttempt(waiting.id, clock), releaseAttempt(waiting.id, clock)]).toEqual(["waiting", "waiting"]);
    hold.open();
    await a;
    await Promise.resolve();

    expect(sentIds).toEqual([waiting.id]);
    expect(concurrency.stats("voice").queued).toBe(0);
  });

  it("takes no slot for an assembly attempt or for a timestamps attempt that makes no call", async () => {
    const holder = scheduleVoice();
    const hold = gate();
    const a = sendWithSlot(holder.id, () => hold.opened, clock); // the voice slot is taken
    registerSlotKeyResolver("timestamps", () => null);
    const timestamps = scheduleStageAttempt({ runId: newRunId(), stage: "timestamps", providerId: "native", queuedAt: at(0), dueAt: at(0), trigger: "initial" });
    const assembly = scheduleStageAttempt({ runId: newRunId(), stage: "assembly", providerId: null, queuedAt: at(0), dueAt: at(0), trigger: "initial" });
    const sentIds: string[] = [];
    concurrency.setLimit("alignment", 0);

    await sendWithSlot(timestamps.id, () => void sentIds.push(timestamps.id), clock);
    await sendWithSlot(assembly.id, () => void sentIds.push(assembly.id), clock);

    expect(sentIds).toEqual([timestamps.id, assembly.id]);
    hold.open();
    await a;
  });

  it("keys a timestamps attempt on the alignment stage unless its resolver says no call is made", () => {
    registerSlotKeyResolver("timestamps", undefined);
    concurrency.setLimit("alignment", 1);
    const timestamps = scheduleStageAttempt({ runId: newRunId(), stage: "timestamps", providerId: "native", queuedAt: at(0), dueAt: at(0), trigger: "initial" });

    void sendWithSlot(timestamps.id, () => new Promise<void>(() => {}), clock);

    expect(concurrency.stats("alignment").inFlight).toBe(1);
    expect(concurrency.stats("voice").inFlight).toBe(0);
  });

  it("releases the slot when send throws, and earlier when send calls releaseSlot", async () => {
    const thrower = scheduleVoice();
    const early = scheduleVoice();
    const hold = gate();

    await expect(sendWithSlot(thrower.id, () => { throw new Error("boom"); }, clock)).rejects.toThrow("boom");
    expect(concurrency.stats("voice").inFlight).toBe(0);

    const done = sendWithSlot(early.id, async (_claimed, releaseSlot) => {
      releaseSlot();
      releaseSlot();
      expect(concurrency.stats("voice").inFlight).toBe(0);
      await hold.opened;
    }, clock);
    expect(concurrency.stats("voice").inFlight).toBe(0);
    hold.open();
    await done;
  });

  it("answers gone for an attempt that is no longer scheduled", async () => {
    const attempt = scheduleVoice();
    await sendWithSlot(attempt.id, () => undefined, clock);

    expect(await sendWithSlot(attempt.id, () => undefined, clock)).toEqual({ sent: false, reason: "gone" });
  });
});
