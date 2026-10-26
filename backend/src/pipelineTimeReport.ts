import { db, type PipelinePhase } from "./db.ts";
import { nearestRankPercentile } from "./providerUsageReport.ts";

// record-phase-instants-and-pipeline-report (JOS-228), design Decisions 4 and 5 — the R6 report: elapsed seconds per
// phase (per session and aggregated) and the attempts that timed out, finished late or were superseded.

const PHASES: readonly PipelinePhase[] = ["voice-over", "decomposition", "scenes", "assembly"];
/** The stored session-level stages of each phase; scene attempts record no such outcomes, so `scenes` has none. */
const STAGES_OF_PHASE: Record<PipelinePhase, readonly string[]> = {
  "voice-over": ["voice-over"],
  decomposition: ["timestamps", "decomposition"],
  scenes: [],
  assembly: ["assembly"],
};

export interface PipelinePhaseRow {
  phase: PipelinePhase;
  /** Sessions whose phase started in the period and has an end. */
  sessions: number;
  medianSeconds: number | null;
  p95Seconds: number | null;
  /** `null`: not recorded for the phase (scene attempts store no time-out outcome). */
  timedOut: number | null;
  finishedLate: number | null;
  superseded: number | null;
}

export interface PipelineSessionRow {
  runId: string;
  title: string;
  /** Elapsed seconds per phase; `null` when the phase has no start in the period or no end. */
  seconds: Record<PipelinePhase, number | null>;
}

export interface PipelineTimeReport {
  from: string | null;
  to: string;
  phases: PipelinePhaseRow[];
  sessions: PipelineSessionRow[];
}

/** Pipeline time for the phases started, and the attempts sent, in `[from, to)` (`from` absent: from the beginning). */
export function pipelineTimeReport(period: { from?: string; to: string }): PipelineTimeReport {
  const from = period.from ?? null;
  const instants = db
    .prepare(
      `SELECT p.run_id, r.title, p.phase, p.started_at, p.ended_at
       FROM phase_instants p JOIN runs r ON r.id = p.run_id
       WHERE p.started_at IS NOT NULL AND (? IS NULL OR p.started_at >= ?) AND p.started_at < ?
       ORDER BY p.started_at, p.run_id`,
    )
    .all(from, from, period.to) as unknown as { run_id: string; title: string; phase: PipelinePhase; started_at: string; ended_at: string | null }[];

  const sessions = new Map<string, PipelineSessionRow>();
  const elapsed = new Map<PipelinePhase, number[]>(PHASES.map((phase) => [phase, []]));
  for (const row of instants) {
    const session = sessions.get(row.run_id) ?? { runId: row.run_id, title: row.title, seconds: { "voice-over": null, decomposition: null, scenes: null, assembly: null } };
    sessions.set(row.run_id, session);
    if (row.ended_at === null) continue;
    const seconds = (Date.parse(row.ended_at) - Date.parse(row.started_at)) / 1000;
    session.seconds[row.phase] = seconds;
    elapsed.get(row.phase)!.push(seconds);
  }

  const outcomes = db
    .prepare(
      `SELECT stage, outcome, COUNT(*) c FROM stage_attempts
       WHERE outcome IN ('timed-out', 'late-success', 'superseded') AND sent_at IS NOT NULL AND (? IS NULL OR sent_at >= ?) AND sent_at < ?
       GROUP BY stage, outcome`,
    )
    .all(from, from, period.to) as unknown as { stage: string; outcome: string; c: number }[];
  const count = (phase: PipelinePhase, outcome: string): number | null =>
    STAGES_OF_PHASE[phase].length === 0 ? null : outcomes.filter((row) => row.outcome === outcome && STAGES_OF_PHASE[phase].includes(row.stage)).reduce((total, row) => total + row.c, 0);

  return {
    from,
    to: period.to,
    phases: PHASES.map((phase) => ({
      phase,
      sessions: elapsed.get(phase)!.length,
      medianSeconds: nearestRankPercentile(elapsed.get(phase)!, 0.5),
      p95Seconds: nearestRankPercentile(elapsed.get(phase)!, 0.95),
      timedOut: count(phase, "timed-out"),
      finishedLate: count(phase, "late-success"),
      superseded: count(phase, "superseded"),
    })),
    sessions: [...sessions.values()],
  };
}
