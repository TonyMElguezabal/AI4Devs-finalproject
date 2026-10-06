import { describe, expect, it } from "vitest";
import { createDecompositionFailure, createVoiceOverFailure } from "../src/sessionStateMachine.ts";

// bounded-retry-policy (JOS-184), group 3 — what a failure says about its retry state.

const occurredAt = new Date("2026-10-04T10:00:00.000Z");

describe("A failure exposes its retry state", () => {
  it("carries the cycle, the attempts in that cycle and whether a manual retry is available", () => {
    expect(createVoiceOverFailure({ cause: "the provider kept failing", retryable: true, occurredAt, cycle: 2, attemptsInCycle: 4 })).toMatchObject({
      retryable: true,
      manualRetryAvailable: true,
      cycle: 2,
      attemptsInCycle: 4,
    });
  });

  it("offers no manual retry for a not-retryable failure", () => {
    expect(createVoiceOverFailure({ cause: "the provider rejected the input", retryable: false, occurredAt, cycle: 1, attemptsInCycle: 1 })).toMatchObject({
      retryable: false,
      manualRetryAvailable: false,
    });
  });

  it("defaults to the first attempt of the first cycle when the caller gives none", () => {
    expect(createVoiceOverFailure({ cause: "x", retryable: true, occurredAt })).toMatchObject({ cycle: 1, attemptsInCycle: 1 });
    expect(createDecompositionFailure({ cause: "x", retryable: false, occurredAt })).toMatchObject({ cycle: 1, attemptsInCycle: 1, manualRetryAvailable: false });
  });

  it("refuses a cycle or attempt count outside the budget", () => {
    expect(() => createVoiceOverFailure({ cause: "x", retryable: true, occurredAt, cycle: 0, attemptsInCycle: 1 })).toThrow();
    expect(() => createVoiceOverFailure({ cause: "x", retryable: true, occurredAt, cycle: 1, attemptsInCycle: 5 })).toThrow();
  });
});
