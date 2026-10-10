import type { Phase, SessionSnapshot } from "../types";
import { SessionHeader } from "./SessionHeader";
import { SceneList } from "./SceneList";
import { FinalVideoDownload } from "./FinalVideoDownload";
import { PhaseSection } from "./PhaseSection";
import { downloadFinalVideoUrl } from "../api/client";

interface Props {
  sessionId: string;
  snapshot: SessionSnapshot | undefined;
  connected: boolean;
  /** consult-session (JOS-135) Decision 4 — an unknown or malformed
   * identifier, reported identically. */
  notFound: boolean;
  onStartNew: () => void;
  onPause: () => void;
  onContinue: () => void;
  /** Starts a scene retry; rejects with the refusal reason (retry-or-correct-image, JOS-157). */
  onRetry: (sceneId: string) => Promise<unknown>;
  /** Corrects IMAGE and retries; rejects with the refusal reason. */
  onCorrect: (sceneId: string, instruction: string) => Promise<unknown>;
  /** Retries a failed phase; rejects with the refusal reason (retry-decomposition, JOS-156). */
  onRetryPhase: (phase: Phase) => Promise<unknown>;
}

/**
 * consult-session (JOS-135) — the session page, reached by identifier
 * (Decision 5). Shows only what the session read returns (Decision 6): no
 * state or phase status is derived here, and absent sections (no scenes yet) render as
 * "not yet available" rather than as an error or as silence. Live updates
 * on this page belong to US-18 (JOS-183's seam, `useLiveSession`, already
 * owns the one subscription — this component only renders what it hands
 * back, per task 4.7).
 */
export function SessionPage({
  sessionId,
  snapshot,
  connected,
  notFound,
  onStartNew,
  onPause,
  onContinue,
  onRetry,
  onCorrect,
  onRetryPhase,
}: Props) {
  if (notFound) {
    return (
      <section aria-label="Session not found" className="session-not-found">
        <p>No session was found for this identifier.</p>
        <button type="button" onClick={onStartNew}>
          Start a new project
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Session">
      <p className="session-meta">
        Session: <code>{sessionId}</code> — {connected ? "connected" : "connecting…"}
      </p>
      {snapshot && (
        <>
          <SessionHeader session={snapshot.session} onPause={onPause} onContinue={onContinue} />
          <p className="session-title">{snapshot.session.title}</p>
          <p className="session-script">{snapshot.session.script}</p>
          {snapshot.session.phases.map((progress) => (
            <PhaseSection key={progress.phase} progress={progress} onRetry={() => onRetryPhase(progress.phase)}>
              {progress.phase === "scenes" && (
                <SceneList sessionId={sessionId} scenes={snapshot.scenes} paused={snapshot.session.paused} onRetry={onRetry} onCorrect={onCorrect} />
              )}
              {progress.phase === "assembly" && (
                <FinalVideoDownload state={snapshot.session.state} url={downloadFinalVideoUrl(sessionId)} />
              )}
            </PhaseSection>
          ))}
        </>
      )}
    </section>
  );
}
