import type { SessionEventPayload } from "../types";
import { sessionStatusClass } from "../styles/status";

interface Props {
  session: SessionEventPayload;
  onPause: () => void;
  onContinue: () => void;
}

/** distinguish-paused-session (JOS-153), design Decisions 2-3 — one combined "N stage" statement from a
 * `held`/`running`-shaped list, or `empty` when the list has nothing in it. */
function stageList(stages: ReadonlyArray<{ stage: string; count: number }>): string {
  return stages.map((s) => `${s.count} ${s.stage}`).join(", ");
}

/**
 * PRD §8.1, §8.3, §9, AC07, AC21, AC07b — session's current state, the failed
 * phase and failed scene indexes when `failed`, and, while paused, a marker
 * that the session is waiting for the User (never folded into `state`,
 * design Decision 1) beside what is still generating (`running`) and what
 * will start on continue (`held`) (distinguish-paused-session, JOS-153,
 * design Decision 5). The header never computes either list itself
 * (Decision 1) and never borrows the success or failure styling for the
 * pause (Decision 7): the border keeps the state's own class throughout.
 */
export function SessionHeader({ session, onPause, onContinue }: Props) {
  const offerContinue = session.paused;
  const offerPause = !session.paused && session.state !== "final-video";

  return (
    <section aria-label="Session status" className={`session-header ${sessionStatusClass(session.state)}`}>
      <p className="session-state-line">
        Session state: <strong>{session.state}</strong>
      </p>
      {session.paused && <p className="session-paused-marker">Paused — waiting for you to continue</p>}
      {session.paused && (
        <p className="session-running-line">
          {session.running.length > 0 ? `Still generating: ${stageList(session.running)}` : "Nothing is generating"}
        </p>
      )}
      {session.paused && session.held.length > 0 && <p className="held-stages">Waiting for continue: {stageList(session.held)}</p>}
      {session.state === "failed" && session.failedPhase && <p role="alert">Failed phase: {session.failedPhase}</p>}
      {session.state === "failed" && session.failedSceneIndexes && session.failedSceneIndexes.length > 0 && (
        <p>Failed scenes: {session.failedSceneIndexes.join(", ")}</p>
      )}
      {offerContinue && (
        <button type="button" onClick={onContinue}>
          Continue session
        </button>
      )}
      {offerPause && (
        <button type="button" onClick={onPause}>
          Pause session
        </button>
      )}
    </section>
  );
}
