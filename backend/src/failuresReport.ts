import { MAX_ATTEMPTS_PER_CYCLE } from "./config/providers.ts";
import { db } from "./db.ts";
import { STAGE_ORDER, countedAttempts, type ReportStage } from "./providerUsageReport.ts";

// report-failures-and-retries (JOS-224), design Decisions 1–6 — where retries are wasted: failed attempts by stage and outcome, exhausted
// retry budgets, manual retries, the session-level failure wordings and the scenes failed now.

type SessionStage = "voice" | "alignment" | "reasoning";

export interface FailureStageRow {
  stage: ReportStage;
  transient: number;
  notRetryable: number;
  timedOut: number;
  /** Scenes do not record cycles or manual retries, so the scene stages report `null` (not recorded), never zero. */
  budgetsExhausted: number | null;
  manualRetries: number | null;
}

export interface FailureWording {
  stage: SessionStage;
  message: string;
  attempts: number;
}

export interface FailuresReport {
  from: string | null;
  to: string;
  stages: FailureStageRow[];
  wordings: FailureWording[];
  /** A state, not an event: it ignores the period. */
  failedScenesNow: { image: number; video: number };
}

const SESSION_STAGE_OF: Record<string, SessionStage> = { "voice-over": "voice", timestamps: "alignment", decomposition: "reasoning" };
const WORDINGS_PER_STAGE = 5;

interface SessionAttemptRow {
  stage: string;
  outcome: string;
  attempt_trigger: string;
  sequence_in_cycle: number;
  error_message: string | null;
}

/** Budgets, manual retries and wordings of the session-level stages (design Decision 2). Native timestamps call no provider and are left out. */
function sessionAttempts(from: string | null, to: string): SessionAttemptRow[] {
  return db
    .prepare(
      `SELECT stage, outcome, attempt_trigger, sequence_in_cycle, error_message
       FROM stage_attempts
       WHERE stage IN ('voice-over', 'timestamps', 'decomposition') AND (provider_id IS NULL OR provider_id <> 'elevenlabs-native')
         AND (? IS NULL OR COALESCE(sent_at, queued_at) >= ?) AND COALESCE(sent_at, queued_at) < ?`,
    )
    .all(from, from, to) as unknown as SessionAttemptRow[];
}

const isFailure = (outcome: string) => outcome === "transient" || outcome === "not-retryable" || outcome === "timed-out";

/** The failures report for the attempts sent in `[from, to)` (`from` absent: from the beginning). */
export function failuresReport(period: { from?: string; to: string }): FailuresReport {
  const from = period.from ?? null;
  const rows = new Map<ReportStage, FailureStageRow>();
  const rowOf = (stage: ReportStage): FailureStageRow => {
    let row = rows.get(stage);
    if (!row) {
      const sceneStage = stage === "image" || stage === "video";
      row = { stage, transient: 0, notRetryable: 0, timedOut: 0, budgetsExhausted: sceneStage ? null : 0, manualRetries: sceneStage ? null : 0 };
      rows.set(stage, row);
    }
    return row;
  };

  for (const attempt of countedAttempts(from, period.to)) {
    if (attempt.outcome === "success") continue;
    const row = rowOf(attempt.stage);
    if (attempt.outcome === "transient") row.transient += 1;
    else if (attempt.outcome === "not-retryable") row.notRetryable += 1;
    else row.timedOut += 1;
  }

  const wordingCounts = new Map<string, FailureWording>();
  for (const attempt of sessionAttempts(from, period.to)) {
    const stage = SESSION_STAGE_OF[attempt.stage]!;
    if (attempt.attempt_trigger === "manual") rowOf(stage).manualRetries! += 1;
    if (attempt.sequence_in_cycle === MAX_ATTEMPTS_PER_CYCLE && (attempt.outcome === "transient" || attempt.outcome === "timed-out")) rowOf(stage).budgetsExhausted! += 1;
    if (isFailure(attempt.outcome) && attempt.error_message) {
      const key = `${stage}\u0000${attempt.error_message}`;
      const entry = wordingCounts.get(key) ?? { stage, message: attempt.error_message, attempts: 0 };
      entry.attempts += 1;
      wordingCounts.set(key, entry);
    }
  }

  const byFrequency = (a: FailureWording, b: FailureWording) => b.attempts - a.attempts || a.message.localeCompare(b.message);
  const wordings = STAGE_ORDER.flatMap((stage) => [...wordingCounts.values()].filter((entry) => entry.stage === stage).sort(byFrequency).slice(0, WORDINGS_PER_STAGE));

  // A failed scene failed at its image when it has no image yet, at its clip otherwise (the tests db.ts uses for the retry and move paths).
  const failedScenes = db
    .prepare("SELECT SUM(result IS NULL) AS image, SUM(result IS NOT NULL AND video_result IS NULL) AS video FROM scenes WHERE status = 'failed'")
    .get() as unknown as { image: number | null; video: number | null };

  return {
    from,
    to: period.to,
    stages: [...rows.values()].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)),
    wordings,
    failedScenesNow: { image: failedScenes.image ?? 0, video: failedScenes.video ?? 0 },
  };
}
