import type { SceneEventPayload } from "../types";
import { SceneRow } from "./SceneRow";

interface Props {
  scenes: SceneEventPayload[];
  /** distinguish-paused-session (JOS-153) — passed through to each row (design Decision 6). */
  paused?: boolean;
  /** Starts a scene retry; rejects with the refusal reason (retry-or-correct-image, JOS-157). */
  onRetry: (sceneId: string) => Promise<unknown>;
  /** Corrects IMAGE and retries; rejects with the refusal reason. */
  onCorrect: (sceneId: string, instruction: string) => Promise<unknown>;
}

/**
 * PRD §6, AC11, AC21 — always rendered in ascending scene-identifier order,
 * regardless of the order updates arrive in (Decision 6). Sorting on every
 * render, not trusting arrival/array order, is the point of this component
 * existing separately from `SessionView` — see its ordering test.
 */
export function SceneList({ scenes, paused, onRetry, onCorrect }: Props) {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);

  return (
    <section aria-label="Scenes">
      {ordered.length === 0 ? (
        // consult-session (JOS-135) Decision 6 — an absent section is shown
        // as "not yet available", never as an error or as silence.
        <p className="scenes-not-yet-available">Scenes are not yet available.</p>
      ) : (
        <ul className="scene-list">
          {ordered.map((scene) => (
            <SceneRow key={scene.sceneId} scene={scene} paused={paused} onRetry={onRetry} onCorrect={onCorrect} />
          ))}
        </ul>
      )}
    </section>
  );
}
