import type { SceneEventPayload } from "../types";
import { SceneRow } from "./SceneRow";
import { downloadSceneUrl } from "../api/client";

interface Props {
  sessionId: string;
  scenes: SceneEventPayload[];
  onRetry: (sceneId: string) => void;
  onCorrect: (sceneId: string, instruction: string) => void;
}

/**
 * PRD §6, AC11, AC21 — always rendered in ascending scene-identifier order,
 * regardless of the order updates arrive in (Decision 6). Sorting on every
 * render, not trusting arrival/array order, is the point of this component
 * existing separately from `SessionView` — see its ordering test.
 */
export function SceneList({ sessionId, scenes, onRetry, onCorrect }: Props) {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);

  return (
    <section aria-label="Scenes">
      <ul>
        {ordered.map((scene) => (
          <SceneRow
            key={scene.sceneId}
            scene={scene}
            onRetry={onRetry}
            onCorrect={onCorrect}
            imageDownloadUrl={downloadSceneUrl(sessionId, scene.sceneId, "image")}
            videoDownloadUrl={downloadSceneUrl(sessionId, scene.sceneId, "video")}
          />
        ))}
      </ul>
    </section>
  );
}
