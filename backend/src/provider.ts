import { randomUUID } from "node:crypto";
import { getProviderRequest, insertProviderRequest, markProviderRequestResolved } from "./db.ts";
import type { ProviderOutcome, ProviderOutcomeMode } from "./types.ts";

/**
 * A deterministic, in-process stand-in for a real AI provider.
 *
 * The key design choice: a request's outcome is computed from data persisted
 * in `provider_requests` (sent_at + latency_ms + mode) rather than from a
 * live in-memory timer. That's what lets `pollResult` correctly answer "does
 * the provider still hold this result?" even after OUR process has been
 * killed and restarted — exactly what PRD §12.1 / C6 requires the backend to
 * rely on. The in-memory `setTimeout` in `send()` models the OTHER path a
 * real provider might use (pushing/webhooking its result); it is deliberately
 * lost on process death, which is realistic (a webhook mid-flight is lost
 * too) and is why reconciliation-by-polling on boot is still required.
 */

export type PollOutcome =
  | { status: "pending" }
  | { status: "not_found" } // the provider does not (or no longer) holds this request
  | { status: "resolved"; outcome: ProviderOutcome };

export function send(
  sceneId: string,
  attemptNumber: number,
  mode: ProviderOutcomeMode,
  latencyMs: number,
  onDeliver: (requestId: string) => void,
): string {
  const requestId = randomUUID();
  insertProviderRequest(requestId, sceneId, latencyMs, mode, attemptNumber);
  if (mode !== "unrecoverable") {
    const timer = setTimeout(() => onDeliver(requestId), latencyMs);
    timer.unref();
  }
  return requestId;
}

export function pollResult(requestId: string): PollOutcome {
  const row = getProviderRequest(requestId);
  if (!row) return { status: "not_found" };
  if (row.mode === "unrecoverable") return { status: "not_found" };

  const completesAt = new Date(row.sentAt).getTime() + row.latencyMs;
  if (Date.now() < completesAt) return { status: "pending" };

  return { status: "resolved", outcome: computeOutcome(row.mode, row.sceneId, row.attemptNumber) };
}

function computeOutcome(mode: ProviderOutcomeMode, sceneId: string, attemptNumber: number): ProviderOutcome {
  switch (mode) {
    case "success":
      return { kind: "success", result: `image-${sceneId}-attempt-${attemptNumber}.png` };
    case "transient_failure":
      return { kind: "failed_transient", reason: "stub: transient provider error (503)" };
    case "not_retryable_failure":
      return { kind: "failed_not_retryable", reason: "stub: content-filter rejection" };
    case "flaky":
      return attemptNumber <= 1
        ? { kind: "failed_transient", reason: "stub: flaky provider, first attempt" }
        : { kind: "success", result: `image-${sceneId}-attempt-${attemptNumber}.png` };
    case "unrecoverable":
      throw new Error("unreachable: unrecoverable mode never resolves");
  }
}

export { markProviderRequestResolved };
