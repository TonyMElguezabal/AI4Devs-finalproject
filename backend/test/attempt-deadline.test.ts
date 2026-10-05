import { describe, expect, it } from "vitest";
import { PER_PHASE_MAX_TIME_SECONDS } from "../src/config/providers.ts";
import { attemptDeadline, hasExpired, maxExecutionSeconds } from "../src/retry/attemptDeadline.ts";
import type { AttemptStage } from "../src/types.ts";

// stage-execution-time-limit (JOS-185), spec "The execution clock starts when the attempt is sent".

const SENT_AT = "2026-10-05T10:00:00.000Z";

describe("the deadline of an attempt", () => {
  it("is its send time plus its stage's maximum time", () => {
    const deadline = attemptDeadline({ stage: "voice-over", sentAt: SENT_AT });

    expect(deadline?.toISOString()).toBe("2026-10-05T10:00:10.000Z"); // voice: 10 s
  });

  it("does not exist for an attempt that has not been sent", () => {
    expect(attemptDeadline({ stage: "voice-over", sentAt: null })).toBeNull();
  });

  it("is measured from the send time, never from when the attempt was queued", () => {
    // The input type carries no queuedAt: only sentAt can start the clock.
    const queuedLongAgo = { stage: "image", sentAt: SENT_AT, queuedAt: "2026-10-05T08:00:00.000Z" } as const;

    expect(attemptDeadline(queuedLongAgo)?.toISOString()).toBe("2026-10-05T10:00:25.000Z"); // image: 25 s
  });
});

describe("each stage uses its own maximum time", () => {
  const expected: Array<[AttemptStage, number]> = [
    ["voice-over", PER_PHASE_MAX_TIME_SECONDS.voice],
    ["timestamps", PER_PHASE_MAX_TIME_SECONDS.alignment],
    ["decomposition", PER_PHASE_MAX_TIME_SECONDS.decomposition],
    ["image", PER_PHASE_MAX_TIME_SECONDS.image],
    ["video", PER_PHASE_MAX_TIME_SECONDS.video],
  ];

  it.each(expected)("%s", (stage, seconds) => {
    expect(maxExecutionSeconds(stage)).toBe(seconds);
    const deadline = attemptDeadline({ stage, sentAt: SENT_AT })!;
    expect(deadline.getTime() - new Date(SENT_AT).getTime()).toBe(seconds * 1000);
  });

  it("gives different stages different deadlines", () => {
    const voice = attemptDeadline({ stage: "voice-over", sentAt: SENT_AT })!;
    const video = attemptDeadline({ stage: "video", sentAt: SENT_AT })!;

    expect(video.getTime()).toBeGreaterThan(voice.getTime());
  });
});

describe("a stage whose maximum time is undetermined", () => {
  it("has no deadline (assembly today)", () => {
    expect(maxExecutionSeconds("assembly")).toBeNull();
    expect(attemptDeadline({ stage: "assembly", sentAt: SENT_AT })).toBeNull();
  });

  it("starts being timed as soon as a value is defined", () => {
    const limits = { ...PER_PHASE_MAX_TIME_SECONDS, assembly: 300 };

    expect(attemptDeadline({ stage: "assembly", sentAt: SENT_AT }, limits)?.toISOString()).toBe("2026-10-05T10:05:00.000Z");
  });
});

describe("hasExpired, with an injectable clock", () => {
  const attempt = { stage: "voice-over", sentAt: SENT_AT } as const;

  it("is false until the deadline and true after it", () => {
    expect(hasExpired(attempt, new Date("2026-10-05T10:00:09.999Z"))).toBe(false);
    expect(hasExpired(attempt, new Date("2026-10-05T10:00:10.000Z"))).toBe(false); // exactly at the limit is not over it
    expect(hasExpired(attempt, new Date("2026-10-05T10:00:10.001Z"))).toBe(true);
  });

  it("is false for an attempt that was never sent or has no limit", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");

    expect(hasExpired({ stage: "voice-over", sentAt: null }, now)).toBe(false);
    expect(hasExpired({ stage: "assembly", sentAt: SENT_AT }, now)).toBe(false);
  });
});
