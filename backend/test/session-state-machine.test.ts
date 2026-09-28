import { describe, expect, it } from "vitest";
import {
  InvalidSessionTransitionError,
  assertSessionTransition,
  canTransitionSession,
  createVoiceOverFailure,
} from "../src/sessionStateMachine.ts";
import type { SessionState } from "../src/types.ts";

// generate-voice-over (JOS-136), group 2 — the session transitions this story
// owns: PRD §5 step 2 and §8.1. Every other transition out of these states
// belongs to a later story (decomposition, manual retry) and must be refused
// here, so that no caller can skip ahead before that story exists.

const ALL_SESSION_STATES: readonly SessionState[] = [
  "submitted",
  "voice-over-generating",
  "voice-over-complete",
  "chunk-decomposing",
  "chunks-processing",
  "final-video-generating",
  "final-video",
  "failed",
];

const ALLOWED: ReadonlyArray<readonly [SessionState, SessionState]> = [
  ["submitted", "voice-over-generating"],
  ["voice-over-generating", "voice-over-complete"],
  ["voice-over-generating", "failed"],
];

const isAllowed = (from: SessionState, to: SessionState): boolean =>
  ALLOWED.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to);

describe("Allowed voice-over transitions", () => {
  it.each(ALLOWED)("allows %s -> %s", (from, to) => {
    expect(canTransitionSession(from, to)).toBe(true);
    expect(() => assertSessionTransition(from, to)).not.toThrow();
  });
});

describe("Every other transition is refused", () => {
  const refusedPairs = ALL_SESSION_STATES.flatMap((from) =>
    ALL_SESSION_STATES.filter((to) => !isAllowed(from, to)).map((to) => [from, to] as const),
  );

  it("covers every pair that is not one of the three allowed transitions", () => {
    expect(refusedPairs).toHaveLength(ALL_SESSION_STATES.length ** 2 - ALLOWED.length);
  });

  it.each(refusedPairs)("refuses %s -> %s", (from, to) => {
    expect(canTransitionSession(from, to)).toBe(false);
    expect(() => assertSessionTransition(from, to)).toThrow(InvalidSessionTransitionError);
  });

  it("names both states in the error", () => {
    expect(() => assertSessionTransition("voice-over-complete", "voice-over-generating")).toThrow(
      /voice-over-complete.*voice-over-generating/,
    );
  });
});

describe("A voice-over failure", () => {
  const occurredAt = new Date("2026-09-28T10:00:00.000Z");

  it("carries the phase voice-over, a cause, its retryability and when it happened", () => {
    expect(createVoiceOverFailure({ cause: "The voice provider rejected the request.", retryable: false, occurredAt })).toEqual({
      phase: "voice-over",
      cause: "The voice provider rejected the request.",
      retryable: false,
      occurredAt: "2026-09-28T10:00:00.000Z",
    });
  });

  it("keeps a retryable failure retryable", () => {
    expect(createVoiceOverFailure({ cause: "The voice provider timed out.", retryable: true, occurredAt }).retryable).toBe(true);
  });

  it.each(["", "   "])("refuses a blank cause (%j), since the User must be shown why it failed", (cause) => {
    expect(() => createVoiceOverFailure({ cause, retryable: false, occurredAt })).toThrow(/cause/);
  });
});
