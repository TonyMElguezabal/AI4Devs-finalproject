import {
  clearRunFailure,
  completeStageAttempt,
  getStageAttempt,
  getStageInstanceAttempts,
  inTransaction,
  scheduleStageAttempt,
  stageInstanceKeyOf,
} from "../db.ts";
import { PROVISIONAL_RETRY_DELAY_SECONDS } from "../config/providers.ts";
import type { AttemptStage, StageAttempt } from "../types.ts";
import { armScheduledAttempt } from "./retryScheduler.ts";
import { decideRetry, retryDelaySeconds, type RetryDelayConfig } from "./retryPolicy.ts";

// bounded-retry-policy (JOS-184) Decisions 2, 3, 7 — the only place a stage's
// outcome is recorded and turned into "schedule the next attempt" or "fail".
// Stage code reports a classified outcome here and never changes stage state
// or attempt counts itself.

export type AttemptReport =
  | { outcome: "success"; externalRequestId?: string }
  | { outcome: "transient" | "not-retryable"; errorMessage: string; errorCode?: string; externalRequestId?: string; retryAfterSeconds?: number };

export type RecordedOutcome =
  | { action: "complete" }
  | { action: "scheduled"; next: StageAttempt }
  | { action: "failed"; retryable: boolean; manualRetryAvailable: boolean; cycle: number; attemptsInCycle: number }
  /** The attempt was already completed (a redelivered or concurrent notification): nothing was recorded. */
  | { action: "ignored" };

export interface RecorderOptions {
  now?: () => Date;
  delay?: RetryDelayConfig;
  /** Called with each newly scheduled attempt after it is committed; by default arms the scheduler. */
  onScheduled?: (attempt: StageAttempt) => void;
}

// PROVISIONAL until US-33 records the real values in PRD §11 (JOS-184 task 1.4).
const DEFAULT_DELAY: RetryDelayConfig = { baseSeconds: PROVISIONAL_RETRY_DELAY_SECONDS.base, capSeconds: PROVISIONAL_RETRY_DELAY_SECONDS.cap };

let configuredDelay: RetryDelayConfig = DEFAULT_DELAY;

/** Test and bootstrap hook: the delay every recorder call uses unless the call passes its own. */
export function setRetryDelayConfig(config: RetryDelayConfig): void {
  configuredDelay = config;
}

export function resetRetryDelayConfig(): void {
  configuredDelay = DEFAULT_DELAY;
}

/** Completes the attempt and applies the policy in one transaction; the cap itself is enforced by the store. */
export function recordAttemptOutcome(attemptId: string, report: AttemptReport, options: RecorderOptions = {}): RecordedOutcome {
  const now = (options.now ?? (() => new Date()))();
  const onScheduled = options.onScheduled ?? armScheduledAttempt;

  const result = inTransaction((): RecordedOutcome => {
    const attempt = getStageAttempt(attemptId);
    if (!attempt) return { action: "ignored" };
    const completed = completeStageAttempt(attemptId, {
      outcome: report.outcome,
      finishedAt: now.toISOString(),
      ...(report.externalRequestId ? { externalRequestId: report.externalRequestId } : {}),
      ...(report.outcome !== "success" ? { errorMessage: report.errorMessage, ...(report.errorCode ? { errorCode: report.errorCode } : {}) } : {}),
    });
    if (!completed) return { action: "ignored" };

    const decision = decideRetry({ outcome: report.outcome, attemptsInCycle: attempt.sequenceInCycle });
    if (decision.action === "complete") return { action: "complete" };
    if (decision.action === "fail") {
      return { action: "failed", retryable: decision.retryable, manualRetryAvailable: decision.retryable, cycle: attempt.cycle, attemptsInCycle: attempt.sequenceInCycle };
    }
    const delaySeconds = retryDelaySeconds({
      failedSequence: attempt.sequenceInCycle,
      config: options.delay ?? configuredDelay,
      ...(report.outcome === "transient" && report.retryAfterSeconds !== undefined ? { retryAfterSeconds: report.retryAfterSeconds } : {}),
    });
    const next = scheduleStageAttempt({
      runId: attempt.runId,
      stage: attempt.stage,
      ...(attempt.sceneId ? { sceneId: attempt.sceneId } : {}),
      providerId: attempt.providerId,
      queuedAt: now.toISOString(),
      dueAt: new Date(now.getTime() + delaySeconds * 1000).toISOString(),
      cycle: attempt.cycle,
      trigger: "automatic",
    });
    return { action: "scheduled", next };
  });

  if (result.action === "scheduled") onScheduled(result.next);
  return result;
}

export interface StageInstanceRef {
  sessionId: string;
  sceneId?: string;
  stage: AttemptStage;
}

export type NewCycleResult =
  | { started: true; attempt: StageAttempt }
  | { started: false; reason: "not-failed" | "not-retryable" };

/**
 * Decision 7 — a manual retry. Only a failed stage instance can start one
 * (its latest attempt ended without success and nothing is scheduled or in
 * flight); a not-retryable failure offers no manual retry. The first attempt
 * of the new cycle is recorded as scheduled and due now, so it goes through
 * the gate like any other launch. A session-level failure is cleared here;
 * a scene's own state belongs to the stage that adopts the recorder.
 */
export function startNewCycle(ref: StageInstanceRef, options: RecorderOptions = {}): NewCycleResult {
  const now = (options.now ?? (() => new Date()))();
  const onScheduled = options.onScheduled ?? armScheduledAttempt;

  const result = inTransaction((): NewCycleResult => {
    const attempts = getStageInstanceAttempts(stageInstanceKeyOf(ref.sessionId, ref.stage, ref.sceneId));
    const latest = attempts[attempts.length - 1];
    if (!latest || (latest.outcome !== "transient" && latest.outcome !== "not-retryable")) return { started: false, reason: "not-failed" };
    if (latest.outcome === "not-retryable") return { started: false, reason: "not-retryable" };
    const attempt = scheduleStageAttempt({
      runId: ref.sessionId,
      stage: ref.stage,
      ...(ref.sceneId ? { sceneId: ref.sceneId } : {}),
      providerId: latest.providerId,
      queuedAt: now.toISOString(),
      dueAt: now.toISOString(),
      cycle: latest.cycle + 1,
      trigger: "manual",
    });
    if (!ref.sceneId) clearRunFailure(ref.sessionId);
    return { started: true, attempt };
  });

  if (result.started) onScheduled(result.attempt);
  return result;
}
