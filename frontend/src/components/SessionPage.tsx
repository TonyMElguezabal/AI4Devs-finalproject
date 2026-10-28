import type { Phase, SessionSnapshot } from "../types";
import { SessionHeader } from "./SessionHeader";
import { SceneList } from "./SceneList";
import type { SceneRebuildHandler } from "./SceneRow";
import { SceneProgressSummary } from "./SceneProgressSummary";
import { FinalVideoDownload } from "./FinalVideoDownload";
import { PhaseSection } from "./PhaseSection";
import { PhaseStepper } from "./PhaseStepper";
import { Icon } from "./Icon";
import { resolveResultUrl } from "../api/client";

interface Props {
  sessionId: string;
  snapshot: SessionSnapshot | undefined;
  /** consult-session (JOS-135) Decision 4 — an unknown or malformed
   * identifier, reported identically. */
  notFound: boolean;
  onStartNew: () => void;
  onPause: () => Promise<unknown>;
  onContinue: () => Promise<unknown>;
  /** Starts a scene retry; rejects with the refusal reason (retry-or-correct-image, JOS-157). */
  onRetry: (sceneId: string) => Promise<unknown>;
  /** Corrects IMAGE and retries; rejects with the refusal reason. */
  onCorrect: (sceneId: string, instruction: string) => Promise<unknown>;
  /** Retries a failed phase; rejects with the refusal reason (retry-decomposition, JOS-156). */
  onRetryPhase: (phase: Phase) => Promise<unknown>;
  /** Sets the silence after a scene (adjust-scene-pause, JOS-190). */
  onSetPause?: (sceneId: string, seconds: number) => Promise<unknown>;
  /** Rebuilds the final video with the stored pause edits (adjust-scene-pause, JOS-190). */
  onRebuildFinalVideo?: () => Promise<unknown>;
  /** Rebuilds one scene's image and clip (rebuild-scene, JOS-235). */
  onRebuildScene?: SceneRebuildHandler;
}

/** "14 Oct, 10:42" in the User's own locale and time zone; the instant stays machine-readable on the element. */
function formatStarted(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * consult-session (JOS-135) — the session page, reached by identifier
 * (Decision 5). Shows only what the session read returns (Decision 6): no
 * state or phase status is derived here, and absent sections (no scenes yet) render as
 * "not yet available" rather than as an error or as silence. Live updates
 * on this page belong to US-18 (JOS-183's seam, `useLiveSession`, already
 * owns the one subscription — this component only renders what it hands
 * back, per task 4.7).
 *
 * redesign-visual-design (JOS-198), Decision 4 — a project panel beside the pipeline (stacked below 1024px).
 * The connection indicator moved to the top bar, which owns the live connection's state.
 */
export function SessionPage({
  sessionId,
  snapshot,
  notFound,
  onStartNew,
  onPause,
  onContinue,
  onRetry,
  onCorrect,
  onRetryPhase,
  onSetPause,
  onRebuildFinalVideo,
  onRebuildScene,
}: Props) {
  if (notFound) {
    return (
      <section aria-label="Session not found" className="session-not-found">
        <p>No session was found for this identifier.</p>
        <button type="button" onClick={onStartNew}>
          <Icon name="plus" />
          Start a new project
        </button>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section aria-label="Session">
        <p className="session-loading">
          Loading session <code>{sessionId}</code>…
        </p>
      </section>
    );
  }

  const { session, scenes } = snapshot;
  const scenesDone = scenes.filter((scene) => scene.state === "chunk-complete").length;

  return (
    <section aria-label="Session" className="session-layout">
      <aside className="project-panel pop">
        <div className="project-heading">
          <span className="eyebrow">Project</span>
          <h1 className="project-title">{session.title}</h1>
          <div className="project-meta">
            <span className="chip">{session.language}</span>
            <time dateTime={session.createdAt}>Started {formatStarted(session.createdAt)}</time>
          </div>
        </div>
        <details className="script-disclosure">
          <summary>
            <Icon name="chevron" />
            <span className="when-closed">Show script</span>
            <span className="when-open">Hide script</span>
          </summary>
          <p className="session-script">{session.script}</p>
        </details>
        <SessionHeader session={session} onPause={onPause} onContinue={onContinue} />
        {scenes.length > 0 && (
          <div className="scenes-progress">
            <div className="scenes-progress-label">
              <span>Scenes done</span>
              <span>
                {scenesDone} of {scenes.length}
              </span>
            </div>
            <progress aria-label="Scenes done" value={scenesDone} max={scenes.length} />
            <SceneProgressSummary scenes={scenes} />
          </div>
        )}
        <p className="session-id">
          Session <code>{sessionId}</code>
        </p>
      </aside>
      <div className="pipeline">
        <PhaseStepper phases={session.phases} />
        {session.phases.map((progress) => (
          <PhaseSection key={progress.phase} progress={progress} onRetry={() => onRetryPhase(progress.phase)}>
            {progress.phase === "scenes" && (
              <SceneList scenes={scenes} paused={session.paused} onRetry={onRetry} onCorrect={onCorrect} onSetPause={onSetPause} onRebuild={onRebuildScene} sessionState={session.state} />
            )}
            {progress.phase === "assembly" && (
              <FinalVideoDownload
                url={session.finalVideoUrl ? resolveResultUrl(session.finalVideoUrl) : undefined}
                finalVideo={session.finalVideo}
                // A session that already has a final video and is generating one again is rebuilding (JOS-190, Decision 7).
                rebuilding={session.state === "final-video-generating" && Boolean(session.finalVideoUrl)}
                // rebuild-scene (JOS-235), Decision 9 — offered only while every scene is complete; the backend refuses it otherwise.
                onRebuild={scenes.length > 0 && scenes.every((scene) => scene.state === "chunk-complete") ? onRebuildFinalVideo : undefined}
              />
            )}
          </PhaseSection>
        ))}
      </div>
    </section>
  );
}
