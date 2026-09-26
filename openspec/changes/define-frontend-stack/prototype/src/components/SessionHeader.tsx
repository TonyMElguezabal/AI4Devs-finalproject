import type { SessionEventPayload } from "../types";

interface Props {
  session: SessionEventPayload;
  onPause: () => void;
  onContinue: () => void;
}

/** PRD §8.1, §8.3, §9, AC07, AC21 — session's current state, the failed
 * phase when `failed`, and the paused marker shown distinctly from a
 * generation that is still running (Decision 8: `paused` is never folded
 * into `state`). */
export function SessionHeader({ session, onPause, onContinue }: Props) {
  const isRunning = session.state === "chunks-processing" || session.state === "final-video-generating";

  return (
    <section aria-label="Session status">
      <p>
        Session state: <strong>{session.state}</strong>
        {session.paused && <span> — paused</span>}
      </p>
      {session.state === "failed" && session.failedPhase && <p role="alert">Failed phase: {session.failedPhase}</p>}
      {isRunning &&
        (session.paused ? (
          <button type="button" onClick={onContinue}>
            Continue session
          </button>
        ) : (
          <button type="button" onClick={onPause}>
            Pause session
          </button>
        ))}
    </section>
  );
}
