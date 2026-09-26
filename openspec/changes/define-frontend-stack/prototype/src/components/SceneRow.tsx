import { useState } from "react";
import type { SceneEventPayload } from "../types";

interface Props {
  scene: SceneEventPayload;
  onRetry: (sceneId: string) => void;
  onCorrect: (sceneId: string, instruction: string) => void;
  imageDownloadUrl: string;
  videoDownloadUrl: string;
}

/**
 * PRD §6, §8.2, AC21 — one scene row. PRD §3/§7.2/AC23 also calls for
 * narration interval, requested duration and speed factor in scene details;
 * those come from stories this skeleton does not model (US-15, the media
 * pipeline) and are left out here rather than faked.
 *
 * PRD §10.3, Decision 4 — the correction form exists ONLY when
 * `scene.state === "failed"`; it is never rendered-and-disabled otherwise,
 * and its presence is derived from state, never from a stored flag.
 */
export function SceneRow({ scene, onRetry, onCorrect, imageDownloadUrl, videoDownloadUrl }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState(scene.instruction ?? "");

  const isFailed = scene.state === "failed";
  const isComplete = scene.state === "chunk-complete";

  return (
    <li aria-label={`Scene ${scene.index}`}>
      <span>
        #{scene.index} — {scene.state}
      </span>
      {isFailed && <span role="alert"> {scene.errorCause}</span>}
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {expanded ? `Hide scene ${scene.index} details` : `View scene ${scene.index} details`}
      </button>

      {expanded && (
        <div>
          <dl>
            <dt>Instruction</dt>
            <dd>{scene.instruction}</dd>
            <dt>Provider</dt>
            <dd>{scene.provider}</dd>
            <dt>Attempts</dt>
            <dd>{scene.attempts}</dd>
          </dl>

          {isFailed && (
            <>
              <button type="button" onClick={() => onRetry(scene.sceneId)}>
                Retry scene {scene.index}
              </button>
              <form
                aria-label={`Correct scene ${scene.index} image instruction`}
                onSubmit={(e) => {
                  e.preventDefault();
                  onCorrect(scene.sceneId, draftInstruction);
                }}
              >
                <label htmlFor={`correction-${scene.sceneId}`}>Corrected image instruction for scene {scene.index}</label>
                <textarea
                  id={`correction-${scene.sceneId}`}
                  value={draftInstruction}
                  onChange={(e) => setDraftInstruction(e.target.value)}
                />
                <button type="submit">Save correction and retry</button>
              </form>
            </>
          )}

          {isComplete && (
            <p>
              <a href={imageDownloadUrl}>Download scene {scene.index} image</a>{" "}
              <a href={videoDownloadUrl}>Download scene {scene.index} video</a>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
