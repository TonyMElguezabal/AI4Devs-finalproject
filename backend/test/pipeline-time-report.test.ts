import { beforeEach, describe, expect, it } from "vitest";
import { resetAll, stampPhase } from "../src/db.ts";
import { pipelineTimeReport } from "../src/pipelineTimeReport.ts";
import { newRun } from "./failedStageFixtures.ts";
import { PERIOD, plusMs, seedAttempt } from "./providerUsageFixtures.ts";

// record-phase-instants-and-pipeline-report (JOS-228), group 4 — design Decisions 4 and 5; AC2 and AC3.

const AT = "2026-10-05T10:00:00.000Z";

beforeEach(() => resetAll());

function stamped(phase: "voice-over" | "decomposition" | "scenes" | "assembly", seconds: number | null, title = "Session"): string {
  const runId = newRun(title);
  stampPhase(runId, phase, "started", AT);
  if (seconds !== null) stampPhase(runId, phase, "ended", plusMs(AT, seconds * 1000));
  return runId;
}

const phaseOf = (phase: string) => pipelineTimeReport(PERIOD).phases.find((row) => row.phase === phase)!;

describe("pipelineTimeReport elapsed seconds", () => {
  it("lists each session's seconds and aggregates the count, median and 95th percentile", () => {
    stamped("voice-over", 20, "Short");
    stamped("voice-over", 40, "Long");

    const report = pipelineTimeReport(PERIOD);

    expect(phaseOf("voice-over")).toMatchObject({ sessions: 2, medianSeconds: 20, p95Seconds: 40 });
    expect(report.sessions.map((s) => [s.title, s.seconds["voice-over"]]).sort()).toEqual([["Long", 40], ["Short", 20]]);
  });

  it("shows no time for a phase without an end and does not aggregate it", () => {
    const runId = stamped("decomposition", null, "Running");
    const report = pipelineTimeReport(PERIOD);
    expect(report.sessions.find((s) => s.runId === runId)?.seconds.decomposition).toBeNull();
    expect(phaseOf("decomposition")).toMatchObject({ sessions: 0, medianSeconds: null, p95Seconds: null });
  });

  it("shows no time for a session that has no instants (a session from before they were recorded)", () => {
    newRun("Old session");
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    const report = pipelineTimeReport(PERIOD);
    expect(report.sessions.every((s) => Object.values(s.seconds).every((v) => v === null))).toBe(true);
    expect(phaseOf("voice-over").sessions).toBe(0);
  });

  it("leaves out phases that started outside the period", () => {
    const runId = newRun("Outside");
    stampPhase(runId, "voice-over", "started", "2026-09-01T00:00:00.000Z");
    stampPhase(runId, "voice-over", "ended", "2026-09-01T00:00:30.000Z");
    expect(pipelineTimeReport(PERIOD).sessions).toEqual([]);
  });
});

describe("pipelineTimeReport attempt outcomes", () => {
  it("counts timed-out, late and superseded attempts per phase by the instant they were sent", () => {
    for (const outcome of ["timed-out", "late-success", "superseded", "success"] as const) seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome });
    seedAttempt({ stage: "timestamps", providerId: "align-a", sentAt: AT, outcome: "timed-out" });
    seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "superseded" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: "2026-09-01T00:00:00.000Z", outcome: "timed-out" });

    expect(phaseOf("voice-over")).toMatchObject({ timedOut: 1, finishedLate: 1, superseded: 1 });
    expect(phaseOf("decomposition")).toMatchObject({ timedOut: 1, finishedLate: 0, superseded: 1 });
    expect(phaseOf("assembly")).toMatchObject({ timedOut: 0, finishedLate: 0, superseded: 0 });
  });

  it("reports the scenes counts as not recorded", () => {
    expect(phaseOf("scenes")).toMatchObject({ timedOut: null, finishedLate: null, superseded: null });
  });

  it("returns the four phases in pipeline order", () => {
    expect(pipelineTimeReport(PERIOD).phases.map((row) => row.phase)).toEqual(["voice-over", "decomposition", "scenes", "assembly"]);
  });
});
