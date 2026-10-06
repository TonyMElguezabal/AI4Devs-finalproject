import { describe, expect, it } from "vitest";
import { derivePhaseProgress, deriveSessionState } from "../src/orchestrator.ts";
import type { PhaseProgress, SessionFailure, SessionState } from "../src/types.ts";

// view-progress-by-phase (JOS-168), groups 2 and 3 — design Decisions 1-5: the
// phase list is derived from the session state, never stored.

const PHASES = ["voice-over", "decomposition", "scenes", "assembly"] as const;

function statuses(phases: Array<Omit<PhaseProgress, "stages">>): string[] {
  return phases.map((entry) => entry.status);
}

const voiceOverFailure: SessionFailure = {
  phase: "voice-over",
  cause: "The voice provider is not reachable.",
  retryable: false,
  manualRetryAvailable: false,
  cycle: 1,
  attemptsInCycle: 1,
  occurredAt: "2026-10-05T10:00:00.000Z",
};
const decompositionFailure: SessionFailure = {
  phase: "decomposition",
  cause: "The narration's timestamps could not be obtained: alignment timed out. The script and the narration are unchanged.",
  retryable: true,
  manualRetryAvailable: true,
  cycle: 1,
  attemptsInCycle: 1,
  occurredAt: "2026-10-05T10:00:00.000Z",
};

describe("derivePhaseProgress: the ordered phase list (2.1)", () => {
  const cases: Array<[SessionState, string[]]> = [
    ["submitted", ["pending", "pending", "pending", "pending"]],
    ["voice-over-generating", ["in-progress", "pending", "pending", "pending"]],
    ["voice-over-complete", ["complete", "pending", "pending", "pending"]],
    ["chunk-decomposing", ["complete", "in-progress", "pending", "pending"]],
    ["chunks-processing", ["complete", "complete", "in-progress", "pending"]],
    ["final-video-generating", ["complete", "complete", "complete", "in-progress"]],
    ["final-video", ["complete", "complete", "complete", "complete"]],
  ];

  for (const [state, expected] of cases) {
    it(`maps ${state} to ${expected.join(", ")}`, () => {
      expect(statuses(derivePhaseProgress({ state, held: [] }))).toEqual(expected);
    });
  }

  it("always lists the four phases in pipeline order", () => {
    for (const [state] of cases) {
      expect(derivePhaseProgress({ state, held: [] }).map((entry) => entry.phase)).toEqual([...PHASES]);
    }
  });

  const failedCases: Array<[string, string[]]> = [
    ["voice-over", ["failed", "pending", "pending", "pending"]],
    ["decomposition", ["complete", "failed", "pending", "pending"]],
    ["scenes", ["complete", "complete", "failed", "pending"]],
    ["assembly", ["complete", "complete", "complete", "failed"]],
  ];

  for (const [failedPhase, expected] of failedCases) {
    it(`maps a session failed in ${failedPhase} to exactly one failed phase`, () => {
      expect(statuses(derivePhaseProgress({ state: "failed", failedPhase, held: [] }))).toEqual(expected);
    });
  }

  it("throws when a failed session names no phase", () => {
    expect(() => derivePhaseProgress({ state: "failed", held: [] })).toThrow(/failedPhase/);
  });

  it("throws when a failed session names an unknown phase", () => {
    expect(() => derivePhaseProgress({ state: "failed", failedPhase: "narration", held: [] })).toThrow(/failedPhase/);
  });
});

describe("derivePhaseProgress: the failure of a phase (2.2)", () => {
  it("carries cause and retryable, and nothing else, on a failed decomposition entry", () => {
    const phases = derivePhaseProgress({ state: "failed", failedPhase: "decomposition", failure: decompositionFailure, held: [] });

    expect(phases[1]?.failure).toEqual({ cause: decompositionFailure.cause, retryable: true });
    expect(JSON.stringify(phases)).not.toContain("occurredAt");
  });

  it("carries the failure of a failed voice-over entry, including a not-retryable one", () => {
    const phases = derivePhaseProgress({ state: "failed", failedPhase: "voice-over", failure: voiceOverFailure, held: [] });

    expect(phases[0]?.failure).toEqual({ cause: voiceOverFailure.cause, retryable: false });
  });

  it("carries the failure on an assembly entry given an assembly failure", () => {
    const assemblyFailure = { phase: "assembly", cause: "The final video could not be assembled.", retryable: true, occurredAt: "2026-10-05T10:00:00.000Z" };
    const phases = derivePhaseProgress({ state: "failed", failedPhase: "assembly", failure: assemblyFailure, held: [] });

    expect(phases[3]?.failure).toEqual({ cause: assemblyFailure.cause, retryable: true });
  });

  it("carries no failure on a failed scenes entry, even when a failure is recorded", () => {
    const phases = derivePhaseProgress({ state: "failed", failedPhase: "scenes", failure: decompositionFailure, held: [] });

    expect(phases[2]?.failure).toBeUndefined();
  });

  it("carries no failure when the recorded failure belongs to another phase", () => {
    const phases = derivePhaseProgress({ state: "failed", failedPhase: "voice-over", failure: decompositionFailure, held: [] });

    expect(phases.every((entry) => entry.failure === undefined)).toBe(true);
  });

  it("carries no failure on any entry of a session that is not failed", () => {
    const phases = derivePhaseProgress({ state: "chunk-decomposing", failure: decompositionFailure, held: [] });

    expect(phases.every((entry) => entry.failure === undefined)).toBe(true);
  });
});

describe("derivePhaseProgress: held work (2.3)", () => {
  it("is 0 on every entry when nothing is held", () => {
    expect(derivePhaseProgress({ state: "chunks-processing", held: [] }).map((entry) => entry.heldCount)).toEqual([0, 0, 0, 0]);
  });

  it("maps each stage to its phase and sums image and video into scenes", () => {
    const held = [
      { stage: "voice-over", count: 1 },
      { stage: "decomposition", count: 1 },
      { stage: "image", count: 2 },
      { stage: "video", count: 3 },
      { stage: "assembly", count: 1 },
    ];

    expect(derivePhaseProgress({ state: "chunks-processing", held }).map((entry) => entry.heldCount)).toEqual([1, 1, 5, 1]);
  });

  it("ignores a stage that belongs to no phase", () => {
    expect(derivePhaseProgress({ state: "chunks-processing", held: [{ stage: "timestamps", count: 4 }] }).map((entry) => entry.heldCount)).toEqual([0, 0, 0, 0]);
  });
});

describe("deriveSessionState: a retry in flight (3.1, design Decision 5)", () => {
  it("derives chunk-decomposing for a decomposition failure while its retry is in flight", () => {
    expect(deriveSessionState([], decompositionFailure, { hasVoiceOver: true, timestampsStarted: true, retryInFlight: true })).toEqual({ state: "chunk-decomposing" });
  });

  it("derives voice-over-generating for a voice-over failure while its retry is in flight", () => {
    expect(deriveSessionState([], voiceOverFailure, { retryInFlight: true })).toEqual({ state: "voice-over-generating" });
  });

  it("derives failed when no retry is in flight", () => {
    expect(deriveSessionState([], decompositionFailure, { hasVoiceOver: true, timestampsStarted: true, retryInFlight: false })).toEqual({
      state: "failed",
      failedPhase: "decomposition",
    });
  });

  it("marks the retried phase in progress, with no failure on its entry", () => {
    const derived = deriveSessionState([], decompositionFailure, { hasVoiceOver: true, timestampsStarted: true, retryInFlight: true });

    const phases = derivePhaseProgress({ ...derived, failure: decompositionFailure, held: [] });

    expect(statuses(phases)).toEqual(["complete", "in-progress", "pending", "pending"]);
    expect(phases.every((entry) => entry.failure === undefined)).toBe(true);
  });
});
