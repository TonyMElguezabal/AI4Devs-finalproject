import type { SessionState } from "./types.ts";

// generate-voice-over (JOS-136) — the session transitions this story owns
// (PRD §5 step 2, §8.1). The table is deliberately closed: leaving
// `voice-over-complete` (decomposition) and leaving `failed` (manual retry)
// belong to later stories, which extend the table when they land, so nothing
// can skip ahead before then.

const ALLOWED_SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  submitted: ["voice-over-generating"],
  "voice-over-generating": ["voice-over-complete", "failed"],
  "voice-over-complete": [],
  "chunk-decomposing": [],
  "chunks-processing": [],
  "final-video-generating": [],
  "final-video": [],
  failed: [],
};

export class InvalidSessionTransitionError extends Error {
  constructor(
    readonly from: SessionState,
    readonly to: SessionState,
  ) {
    super(`invalid session transition: ${from} -> ${to}`);
    this.name = "InvalidSessionTransitionError";
  }
}

export function canTransitionSession(from: SessionState, to: SessionState): boolean {
  return ALLOWED_SESSION_TRANSITIONS[from].includes(to);
}

export function assertSessionTransition(from: SessionState, to: SessionState): void {
  if (!canTransitionSession(from, to)) throw new InvalidSessionTransitionError(from, to);
}

/** Design Decision 9 — what the session carries when the voice-over failed. */
export interface VoiceOverFailure {
  phase: "voice-over";
  /** Written for a person; never contains credentials or the script text. */
  cause: string;
  retryable: boolean;
  /** ISO-8601 instant. */
  occurredAt: string;
}

export function createVoiceOverFailure(input: { cause: string; retryable: boolean; occurredAt: Date }): VoiceOverFailure {
  const cause = input.cause.trim();
  if (cause === "") throw new Error("a voice-over failure needs a non-blank cause");
  return {
    phase: "voice-over",
    cause,
    retryable: input.retryable,
    occurredAt: input.occurredAt.toISOString(),
  };
}
