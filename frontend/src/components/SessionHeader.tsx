import type { SessionEventPayload } from "../types";
import { sessionStatusClass } from "../styles/status";

interface Props {
  session: SessionEventPayload;
  onPause: () => void;
  onContinue: () => void;
}

/** PRD §8.1, §8.3, §9, AC07, AC21 — session's current state, the failed
 * phase and failed scene indexes when `failed`, and the paused marker shown distinctly from a
 * generation that is still running (Decision 8: `paused` is never folded
 * into `state`). */
export function SessionHeader({ session, onPause, onContinue }: Props) {
  const isRunning = session.state === "chunks-processing" || session.state === "final-video-generating";

  return (
    <section aria-label="Session status" className={`session-header ${sessionStatusClass(session.state)}`}>
      <p className={`session-state-line${session.paused ? " paused" : ""}`}>
        Session state: <strong>{session.state}</strong>
        {session.paused && <span> — paused</span>}
      </p>
      {session.state === "failed" && session.failedPhase && <p role="alert">Failed phase: {session.failedPhase}</p>}
      {session.state === "failed" && session.failedSceneIndexes && session.failedSceneIndexes.length > 0 && (
        <p>Failed scenes: {session.failedSceneIndexes.join(", ")}</p>
      )}
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
