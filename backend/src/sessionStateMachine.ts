import type { DecompositionFailure, SessionState, VoiceOverFailure } from "./types.ts";

export type { DecompositionFailure, VoiceOverFailure } from "./types.ts";

// generate-voice-over (JOS-136) — the session transitions this story owns
// (PRD §5 step 2, §8.1) and the decomposition phase (JOS-139). The table is
// deliberately closed: leaving `failed` (manual retry) and the later phases
// belong to their own stories, which extend the table when they land, so
// nothing can skip ahead before then.

const ALLOWED_SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  submitted: ["voice-over-generating"],
  "voice-over-generating": ["voice-over-complete", "failed"],
  // obtain-narration-timestamps (JOS-139): the decomposition phase.
  "voice-over-complete": ["chunk-decomposing"],
  "chunk-decomposing": ["chunks-processing", "failed"],
  // gate-assembly-on-complete-scenes (JOS-150): the exits the assembly gate decides.
  "chunks-processing": ["final-video-generating", "failed"],
  "final-video-generating": [],
  "final-video": [],
  failed: [],
};

// Fields are declared explicitly, not as constructor parameter properties:
// the server runs as `node src/server.ts` (strip-only mode), which refuses
// TypeScript syntax that emits code. `erasableSyntaxOnly` enforces this.
export class InvalidSessionTransitionError extends Error {
  readonly from: SessionState;
  readonly to: SessionState;

  constructor(from: SessionState, to: SessionState) {
    super(`invalid session transition: ${from} -> ${to}`);
    this.name = "InvalidSessionTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionSession(from: SessionState, to: SessionState): boolean {
  return ALLOWED_SESSION_TRANSITIONS[from].includes(to);
}

export function assertSessionTransition(from: SessionState, to: SessionState): void {
  if (!canTransitionSession(from, to)) throw new InvalidSessionTransitionError(from, to);
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

/** assign-scene-identifiers (JOS-144) Decision 6 — the failure recorded when a system-generated decomposition is refused. */
export function createDecompositionFailure(input: { cause: string; retryable: boolean; occurredAt: Date }): DecompositionFailure {
  const cause = input.cause.trim();
  if (cause === "") throw new Error("a decomposition failure needs a non-blank cause");
  return {
    phase: "decomposition",
    cause,
    retryable: input.retryable,
    occurredAt: input.occurredAt.toISOString(),
  };
}
