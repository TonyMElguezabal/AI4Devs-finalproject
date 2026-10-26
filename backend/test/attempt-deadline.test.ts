import { describe, expect, it } from "vitest";
import { PER_PHASE_MAX_TIME_SECONDS } from "../src/config/providers.ts";
import { limitSeconds } from "./phaseLimit.ts";
import { attemptDeadline, hasExpired, maxExecutionSeconds } from "../src/retry/attemptDeadline.ts";
import type { AttemptStage } from "../src/types.ts";

// stage-execution-time-limit (JOS-185), spec "The execution clock starts when the attempt is sent".

const SENT_AT = "2026-10-05T10:00:00.000Z";

describe("the deadline of an attempt", () => {
  it("is its send time plus its stage's maximum time", () => {
    const deadline = attemptDeadline({ stage: "voice-over", sentAt: SENT_AT });

    expect(deadline?.getTime()).toBe(new Date(SENT_AT).getTime() + limitSeconds("voice") * 1000);
  });

  it("does not exist for an attempt that has not been sent", () => {
    expect(attemptDeadline({ stage: "voice-over", sentAt: null })).toBeNull();
  });

  it("is measured from the send time, never from when the attempt was queued", () => {
    // The input type carries no queuedAt: only sentAt can start the clock.
    const queuedLongAgo = { stage: "image", sentAt: SENT_AT, queuedAt: "2026-10-05T08:00:00.000Z" } as const;

    expect(attemptDeadline(queuedLongAgo)?.toISOString()).toBe("2026-10-05T10:02:00.000Z"); // image: 120 s
  });
});

describe("each stage uses its own maximum time", () => {
  const expected: Array<[AttemptStage, number]> = [
    ["voice-over", limitSeconds("voice")],
    ["timestamps", limitSeconds("alignment")],
    ["decomposition", limitSeconds("decomposition")],
    ["image", limitSeconds("image")],
    ["video", limitSeconds("video")],
  ];

  it.each(expected)("%s", (stage, seconds) => {
    expect(maxExecutionSeconds(stage)).toBe(seconds);
    const deadline = attemptDeadline({ stage, sentAt: SENT_AT })!;
    expect(deadline.getTime() - new Date(SENT_AT).getTime()).toBe(seconds * 1000);
  });

  it("gives different stages different deadlines", () => {
    const voice = attemptDeadline({ stage: "voice-over", sentAt: SENT_AT })!;
    const image = attemptDeadline({ stage: "image", sentAt: SENT_AT })!;

    expect(voice.getTime()).toBeGreaterThan(image.getTime());
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
    const deadlineMs = new Date(SENT_AT).getTime() + limitSeconds("voice") * 1000;
    expect(hasExpired(attempt, new Date(deadlineMs - 1))).toBe(false);
    expect(hasExpired(attempt, new Date(deadlineMs))).toBe(false); // exactly at the limit is not over it
    expect(hasExpired(attempt, new Date(deadlineMs + 1))).toBe(true);
  });

  it("is false for an attempt that was never sent or has no limit", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");

    expect(hasExpired({ stage: "voice-over", sentAt: null }, now)).toBe(false);
    expect(hasExpired({ stage: "assembly", sentAt: SENT_AT }, now)).toBe(false);
  });
});

// raise-video-time-limit (JOS-197), spec video-stage-time-limit — the limits fit a full-size script, so a request still
// being processed after the times measured at the product's real scale is not expired.
describe("an attempt at the product's real script size", () => {
  const at = (seconds: number) => new Date(new Date(SENT_AT).getTime() + seconds * 1000);

  it("a voice-over of 10,000 characters still in flight after 151 s has not expired", () => {
    expect(hasExpired({ stage: "voice-over", sentAt: SENT_AT }, at(151))).toBe(false);
  });

  it("a decomposition of 67 fragments still in flight after 209 s has not expired", () => {
    expect(hasExpired({ stage: "decomposition", sentAt: SENT_AT }, at(209))).toBe(false);
  });

  it("a 14 s clip still in flight after 640 s has not expired", () => {
    expect(hasExpired({ stage: "video", sentAt: SENT_AT }, at(640))).toBe(false);
  });

  it.each([
    ["voice-over", 600],
    ["decomposition", 600],
    ["video", 1200],
  ] as const)("%s expires once it is past %i s", (stage, limit) => {
    expect(hasExpired({ stage, sentAt: SENT_AT }, at(limit))).toBe(false);
    expect(hasExpired({ stage, sentAt: SENT_AT }, at(limit + 1))).toBe(true);
  });
});
