import { useState } from "react";
import type { SceneEventPayload } from "../types";
import { sceneStatusClass } from "../styles/status";

interface Props {
  scene: SceneEventPayload;
  onRetry: (sceneId: string) => void;
  onCorrect: (sceneId: string, instruction: string) => void;
  imageDownloadUrl: string;
  videoDownloadUrl: string;
}

/**
 * PRD §6, §8.2, AC21 — one scene row. PRD §3/§7.2/AC23 also calls for a
 * narration interval in scene details; that comes from a story this
 * skeleton does not model and is left out here rather than faked. The
 * requested duration and speed factor (record-speed-adjustment-factor,
 * JOS-148) are rendered below, read-only, when the backend sends them.
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
    <li aria-label={`Scene ${scene.index}`} className={`scene-row ${sceneStatusClass(scene.state)}`}>
      <span className="scene-summary">
        #{scene.index} — {scene.state}
      </span>
      {scene.held && <span className="scene-held"> — waiting for continue</span>}
      {isFailed && <span role="alert"> {scene.errorCause}</span>}
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {expanded ? `Hide scene ${scene.index} details` : `View scene ${scene.index} details`}
      </button>

      {expanded && (
        <div className="scene-details">
          <dl>
            <dt>Instruction</dt>
            <dd>{scene.instruction}</dd>
            <dt>Provider</dt>
            <dd>{scene.provider}</dd>
            <dt>Attempts</dt>
            <dd>{scene.attempts}</dd>
            {scene.requestedDurationSeconds !== undefined && (
              <>
                <dt>Requested duration</dt>
                <dd>
                  {scene.requestedDurationSeconds}
                  {scene.durationWarning && <span role="alert"> {scene.durationWarning}</span>}
                </dd>
              </>
            )}
            {scene.speedFactor !== undefined && (
              <>
                <dt>Speed factor</dt>
                <dd>
                  {scene.speedFactor}
                  {scene.speedFactorWarning && <span role="alert"> {scene.speedFactorWarning}</span>}
                </dd>
              </>
            )}
          </dl>

          {isFailed && (
            <>
              <button type="button" onClick={() => onRetry(scene.sceneId)}>
                Retry scene {scene.index}
              </button>
              <form
                aria-label={`Correct scene ${scene.index} image instruction`}
                className="correction-form"
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
            <p className="download-links">
              <a href={imageDownloadUrl}>Download scene {scene.index} image</a>
              <a href={videoDownloadUrl}>Download scene {scene.index} video</a>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
