import { useState } from "react";
import type { SessionEventPayload } from "../types";
import { sessionPauseRefusalSentence } from "../pauseRefusals";
import { sessionStatusClass } from "../styles/status";
import { SESSION_STATE_LABEL } from "../statusLabels";
import { Icon } from "./Icon";
import { StatusPill } from "./StatusPill";

interface Props {
  session: SessionEventPayload;
  onPause: () => Promise<unknown>;
  onContinue: () => Promise<unknown>;
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
 * pause (Decision 7): the pill keeps the state's own class throughout.
 *
 * redesign-visual-design (JOS-198), Decision 3 — the state is shown as its plain-language label in a pill.
 *
 * surface-pause-continue-failure (JOS-217), Decision 1 — the buttons are disabled while their request is outstanding and a
 * failure shows as a sentence; the new state still comes from the live update.
 */
export function SessionHeader({ session, onPause, onContinue }: Props) {
  const offerContinue = session.paused;
  const offerPause = !session.paused && session.state !== "final-video";
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function run(action: "pause" | "continue", request: () => Promise<unknown>) {
    setPending(true);
    setRefusal(null);
    try {
      await request();
    } catch (error) {
      setRefusal(sessionPauseRefusalSentence(action, error instanceof Error ? error.message : ""));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Session status" className={`session-header ${sessionStatusClass(session.state)}`}>
      <div className="session-state-line">
        <span className="eyebrow">Session state</span>
        <StatusPill statusClass={sessionStatusClass(session.state)} label={SESSION_STATE_LABEL[session.state]} />
      </div>
      {session.paused && (
        <p className="session-paused-marker">
          <Icon name="pause" />
          Paused — waiting for you to continue
        </p>
      )}
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
        <button type="button" className="primary" disabled={pending} onClick={() => void run("continue", onContinue)}>
          <Icon name="play" />
          Continue session
        </button>
      )}
      {offerPause && (
        <button type="button" disabled={pending} onClick={() => void run("pause", onPause)}>
          <Icon name="pause" />
          Pause session
        </button>
      )}
      {refusal && <p role="status">{refusal}</p>}
    </section>
  );
}
