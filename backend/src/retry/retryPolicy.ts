import { MAX_ATTEMPTS_PER_CYCLE } from "../config/providers.ts";
import type { PipelineStage } from "../launchGate.ts";

// bounded-retry-policy (JOS-184) Decisions 1, 2, 5 — pure code, no I/O.

export type ClassifiedOutcome = "success" | "transient" | "not-retryable";

export type RetryDecision =
  | { action: "complete" }
  | { action: "schedule-next"; nextSequence: number }
  | { action: "fail"; retryable: boolean };

export function decideRetry(input: { outcome: ClassifiedOutcome; attemptsInCycle: number }): RetryDecision {
  if (input.outcome === "success") return { action: "complete" };
  if (input.outcome === "not-retryable") return { action: "fail", retryable: false };
  if (input.attemptsInCycle >= MAX_ATTEMPTS_PER_CYCLE) return { action: "fail", retryable: true };
  return { action: "schedule-next", nextSequence: input.attemptsInCycle + 1 };
}

export interface RetryDelayConfig {
  baseSeconds: number;
  capSeconds: number;
}

/** Decision 5 — `max(retryAfter, min(base × 2^(sequence−1), cap))`; a provider's instruction is never undercut, even above the cap. */
export function retryDelaySeconds(input: { failedSequence: number; config: RetryDelayConfig; retryAfterSeconds?: number }): number {
  const exponential = Math.min(input.config.baseSeconds * 2 ** (input.failedSequence - 1), input.config.capSeconds);
  const retryAfter = input.retryAfterSeconds;
  return retryAfter !== undefined && Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(exponential, retryAfter) : exponential;
}

/** Decision 1 — identifies the budget an attempt counts against. */
export function stageInstanceKey(input: { sessionId: string; sceneId?: string; stage: PipelineStage }): string {
  const sceneLevel = input.stage === "image" || input.stage === "video";
  if (sceneLevel && input.sceneId === undefined) throw new Error(`the '${input.stage}' stage needs a scene to identify its stage instance`);
  if (!sceneLevel && input.sceneId !== undefined) throw new Error(`the '${input.stage}' stage is session-level and takes no scene`);
  return sceneLevel ? `${input.sessionId}:${input.sceneId}:${input.stage}` : `${input.sessionId}:${input.stage}`;
}
