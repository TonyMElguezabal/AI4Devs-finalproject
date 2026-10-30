/** Nearest-rank percentile (`sorted[ceil(p × n) − 1]`) of the values; `null` when there are none. */
export function nearestRankPercentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1]!;
}

import { db } from "./db.ts";

export type ReportStage = "voice" | "alignment" | "reasoning" | "image" | "video";

export interface ProviderUsageRow {
  stage: ReportStage;
  providerId: string;
  providerLabel: string;
  attempts: number;
  successes: number;
  transient: number;
  notRetryable: number;
  timedOut: number;
  successRatePercent: number;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  billedUnits: number;
  unit: string;
}

export interface ProviderUsageReport {
  from: string | null;
  to: string;
  /** True until JOS-222 records the provider on scene attempts: image and clip rows follow the scene's current provider. */
  sceneAttemptsFollowCurrentProvider: boolean;
  rows: ProviderUsageRow[];
}

type CountedOutcome = "success" | "transient" | "not-retryable" | "timed-out";

export interface CountedAttempt {
  runId: string;
  stage: ReportStage;
  providerId: string;
  outcome: CountedOutcome;
  latencyMs: number | null;
  unit: string;
  units: number;
}

export const STAGE_ORDER: readonly ReportStage[] = ["voice", "alignment", "reasoning", "image", "video"];
const SESSION_STAGES = { "voice-over": ["voice", "voice_characters"], timestamps: ["alignment", "audio_seconds"], decomposition: ["reasoning", "requests"] } as const;
const SESSION_OUTCOMES: Record<string, CountedOutcome> = { success: "success", "late-success": "success", transient: "transient", "not-retryable": "not-retryable", "timed-out": "timed-out" };
const SCENE_OUTCOMES: Record<string, CountedOutcome> = { success: "success", transient_failure: "transient", not_retryable_failure: "not-retryable" };

// report-failures-and-retries (JOS-224), design Decision 1 — exported so the failures report counts exactly the rows this report counts.
export function countedAttempts(from: string | null, to: string): CountedAttempt[] {
  return readCountedAttempts((sentAt) => ({ sql: `(? IS NULL OR ${sentAt} >= ?) AND ${sentAt} < ?`, params: [from, from, to] }));
}

/** report-estimated-cost (JOS-227), design Decision 5 — the same rows for the given sessions, whenever they were sent. */
export function countedAttemptsOfRuns(runIds: readonly string[]): CountedAttempt[] {
  if (runIds.length === 0) return [];
  return readCountedAttempts((_sentAt, runId) => ({ sql: `${runId} IN (${runIds.map(() => "?").join(", ")})`, params: [...runIds] }));
}

type AttemptFilter = (sentAtColumn: string, runIdColumn: string) => { sql: string; params: (string | null)[] };

// ponytail: reads every counted attempt of the period into memory; move the aggregation into SQL if "all time" gets slow.
function readCountedAttempts(filter: AttemptFilter): CountedAttempt[] {
  const sessionFilter = filter("a.sent_at", "a.run_id");
  const sceneFilter = filter("pr.sent_at", "s.run_id");
  const sessionRows = db
    .prepare(
      `SELECT a.run_id, a.stage, a.provider_id, a.outcome, a.sent_at, a.finished_at,
              CASE a.stage WHEN 'voice-over' THEN (SELECT LENGTH(script) FROM runs r WHERE r.id = a.run_id)
                           WHEN 'timestamps' THEN (SELECT duration_seconds FROM voice_overs v WHERE v.run_id = a.run_id)
                           ELSE 1 END AS units
       FROM stage_attempts a
       WHERE a.stage IN ('voice-over', 'timestamps', 'decomposition') AND a.provider_id IS NOT NULL AND a.provider_id <> 'elevenlabs-native'
         AND a.sent_at IS NOT NULL AND a.outcome IN ('success', 'late-success', 'transient', 'not-retryable', 'timed-out')
         AND ${sessionFilter.sql}`,
    )
    .all(...sessionFilter.params) as unknown as { run_id: string; stage: keyof typeof SESSION_STAGES; provider_id: string; outcome: string; sent_at: string; finished_at: string | null; units: number | null }[];
  const sceneRows = db
    .prepare(
      `SELECT s.run_id, pr.stage, CASE pr.stage WHEN 'image' THEN s.provider ELSE s.video_provider END AS provider_id, pr.mode, pr.latency_ms,
              CASE pr.stage WHEN 'image' THEN 1 ELSE s.requested_duration_seconds END AS units
       FROM provider_requests pr JOIN scenes s ON s.id = pr.scene_id
       WHERE pr.mode IN ('success', 'transient_failure', 'not_retryable_failure')
         AND ${sceneFilter.sql}`,
    )
    .all(...sceneFilter.params) as unknown as { run_id: string; stage: "image" | "video"; provider_id: string | null; mode: string; latency_ms: number; units: number | null }[];

  return [
    ...sessionRows.map((row) => ({
      runId: row.run_id,
      stage: SESSION_STAGES[row.stage][0],
      providerId: row.provider_id,
      outcome: SESSION_OUTCOMES[row.outcome]!,
      latencyMs: row.finished_at ? Date.parse(row.finished_at) - Date.parse(row.sent_at) : null,
      unit: SESSION_STAGES[row.stage][1],
      units: row.units ?? 0,
    })),
    ...sceneRows
      .filter((row) => row.provider_id !== null)
      .map((row) => ({
        runId: row.run_id,
        stage: row.stage,
        providerId: row.provider_id!,
        outcome: SCENE_OUTCOMES[row.mode]!,
        latencyMs: row.latency_ms,
        unit: row.stage === "image" ? "images" : "clip_seconds",
        units: row.units ?? 0,
      })),
  ];
}

/** Provider usage per stage and provider for the attempts sent in `[from, to)` (`from` absent: from the beginning). */
export function providerUsageReport(period: { from?: string; to: string }): ProviderUsageReport {
  const from = period.from ?? null;
  const labels = new Map((db.prepare("SELECT id, label FROM provider_profiles").all() as unknown as { id: string; label: string }[]).map((row) => [row.id, row.label]));
  const groups = new Map<string, CountedAttempt[]>();
  for (const attempt of countedAttempts(from, period.to)) {
    const key = `${attempt.stage}\u0000${attempt.providerId}`;
    groups.set(key, [...(groups.get(key) ?? []), attempt]);
  }

  const rows = [...groups.values()].map((attempts): ProviderUsageRow => {
    const first = attempts[0]!;
    const successes = attempts.filter((attempt) => attempt.outcome === "success");
    const latencies = attempts.flatMap((attempt) => (attempt.latencyMs === null ? [] : [attempt.latencyMs]));
    return {
      stage: first.stage,
      providerId: first.providerId,
      providerLabel: labels.get(first.providerId) ?? first.providerId,
      attempts: attempts.length,
      successes: successes.length,
      transient: attempts.filter((attempt) => attempt.outcome === "transient").length,
      notRetryable: attempts.filter((attempt) => attempt.outcome === "not-retryable").length,
      timedOut: attempts.filter((attempt) => attempt.outcome === "timed-out").length,
      successRatePercent: Math.round((1000 * successes.length) / attempts.length) / 10,
      medianLatencyMs: nearestRankPercentile(latencies, 0.5),
      p95LatencyMs: nearestRankPercentile(latencies, 0.95),
      billedUnits: successes.reduce((total, attempt) => total + attempt.units, 0),
      unit: first.unit,
    };
  });

  rows.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.providerLabel.localeCompare(b.providerLabel));
  return { from, to: period.to, sceneAttemptsFollowCurrentProvider: true, rows };
}
