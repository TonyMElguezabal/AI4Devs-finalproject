import { describe, expect, it } from "vitest";
import { decideRetry, retryDelaySeconds, stageInstanceKey, type RetryDelayConfig } from "../src/retry/retryPolicy.ts";

// bounded-retry-policy (JOS-184), group 2 — the pure policy: what happens
// after a classified outcome, how long to wait, and which budget an attempt
// belongs to. No I/O, so every combination is tested directly.

const DELAY: RetryDelayConfig = { baseSeconds: 2, capSeconds: 10 };

describe("decideRetry", () => {
  it("completes the stage instance on success, whatever the attempt count", () => {
    for (const attemptsInCycle of [1, 2, 3, 4]) {
      expect(decideRetry({ outcome: "success", attemptsInCycle })).toEqual({ action: "complete" });
    }
  });

  it.each([1, 2, 3])("schedules the next attempt after a transient failure at attempt %i", (attemptsInCycle) => {
    expect(decideRetry({ outcome: "transient", attemptsInCycle })).toEqual({ action: "schedule-next", nextSequence: attemptsInCycle + 1 });
  });

  it("fails the stage instance as retryable once the fourth attempt fails transiently", () => {
    expect(decideRetry({ outcome: "transient", attemptsInCycle: 4 })).toEqual({ action: "fail", retryable: true });
  });

  it.each([1, 2, 3, 4])("fails the stage instance as not retryable at attempt %i", (attemptsInCycle) => {
    expect(decideRetry({ outcome: "not-retryable", attemptsInCycle })).toEqual({ action: "fail", retryable: false });
  });

  it("never schedules past the cap, even for an out-of-range count", () => {
    expect(decideRetry({ outcome: "transient", attemptsInCycle: 7 })).toEqual({ action: "fail", retryable: true });
  });
});

describe("retryDelaySeconds", () => {
  it("doubles from the base after each failed attempt", () => {
    expect([1, 2, 3].map((sequence) => retryDelaySeconds({ failedSequence: sequence, config: { baseSeconds: 1, capSeconds: 100 } }))).toEqual([1, 2, 4]);
  });

  it("never exceeds the cap", () => {
    expect(retryDelaySeconds({ failedSequence: 3, config: DELAY })).toBe(8);
    expect(retryDelaySeconds({ failedSequence: 4, config: DELAY })).toBe(10);
    expect(retryDelaySeconds({ failedSequence: 30, config: DELAY })).toBe(10);
  });

  it("is never earlier than the provider's retry-after", () => {
    expect(retryDelaySeconds({ failedSequence: 1, config: DELAY, retryAfterSeconds: 25 })).toBe(25);
    expect(retryDelaySeconds({ failedSequence: 1, config: DELAY, retryAfterSeconds: 1 })).toBe(2);
  });

  it("ignores a negative or non-finite retry-after", () => {
    expect(retryDelaySeconds({ failedSequence: 1, config: DELAY, retryAfterSeconds: -5 })).toBe(2);
    expect(retryDelaySeconds({ failedSequence: 1, config: DELAY, retryAfterSeconds: Number.NaN })).toBe(2);
  });
});

describe("stageInstanceKey", () => {
  it("keys a session-level stage by session and stage", () => {
    expect(stageInstanceKey({ sessionId: "s1", stage: "voice-over" })).toBe("s1:voice-over");
    expect(stageInstanceKey({ sessionId: "s1", stage: "assembly" })).toBe("s1:assembly");
  });

  it("treats decomposition as a single instance per session", () => {
    expect(stageInstanceKey({ sessionId: "s1", stage: "decomposition" })).toBe("s1:decomposition");
  });

  it("keys a scene-level stage by session, scene and stage", () => {
    expect(stageInstanceKey({ sessionId: "s1", sceneId: "sc1", stage: "image" })).toBe("s1:sc1:image");
    expect(stageInstanceKey({ sessionId: "s1", sceneId: "sc2", stage: "image" })).not.toBe(stageInstanceKey({ sessionId: "s1", sceneId: "sc1", stage: "image" }));
    expect(stageInstanceKey({ sessionId: "s1", sceneId: "sc1", stage: "video" })).not.toBe(stageInstanceKey({ sessionId: "s1", sceneId: "sc1", stage: "image" }));
  });

  it("requires a scene for image and video, and refuses one for the session-level stages", () => {
    expect(() => stageInstanceKey({ sessionId: "s1", stage: "image" })).toThrow();
    expect(() => stageInstanceKey({ sessionId: "s1", stage: "video" })).toThrow();
    expect(() => stageInstanceKey({ sessionId: "s1", sceneId: "sc1", stage: "voice-over" })).toThrow();
  });
});
