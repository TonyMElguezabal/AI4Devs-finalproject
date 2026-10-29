import { summariseSceneProgress } from "../sceneProgress";
import type { SceneEventPayload } from "../types";

interface Props {
  scenes: ReadonlyArray<Pick<SceneEventPayload, "index" | "state" | "affectedStage">>;
}

/**
 * summarise-scene-progress (JOS-234), design Decision 4 — the project panel's read-only count of scenes per stage.
 * A description list, not a live region: it changes on every scene update, and announcing each would flood a screen
 * reader. Information only, so no control and no `role="alert"`.
 */
export function SceneProgressSummary({ scenes }: Props) {
  const lines = summariseSceneProgress(scenes);
  if (lines.length === 0) return null;

  return (
    <div role="group" aria-label="Scene progress" className="scene-progress">
      <dl>
        {lines.map((line) => (
          <div key={line.key} className="scene-progress-line">
            <dt>{line.label}</dt>
            <dd>
              {line.total !== undefined ? `${line.count} of ${line.total}` : line.count}
              {line.numbers ? ` · ${line.numbers}` : ""}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
