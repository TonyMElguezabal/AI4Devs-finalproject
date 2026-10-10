import { useEffect, useState } from "react";
import type { SceneEventPayload } from "../types";
import { sceneStatusClass } from "../styles/status";
import { sceneActions } from "../sceneActions";
import { resolveResultUrl } from "../api/client";
import { formatStageDiagnostic } from "../stageDiagnostics";
import { sceneRecoveryRefusalSentence } from "../sceneRecoveryRefusals";

interface Props {
  scene: SceneEventPayload;
  /** distinguish-paused-session (JOS-153), design Decision 6 — whether the session is paused; decides between
   * "waiting for continue" (held) and "still generating" (sent before the pause, not held). */
  paused?: boolean;
  /** Starts a scene retry; rejects with the refusal reason (retry-or-correct-image, JOS-157). */
  onRetry: (sceneId: string) => Promise<unknown>;
  /** Corrects IMAGE and retries; rejects with the refusal reason. */
  onCorrect: (sceneId: string, instruction: string) => Promise<unknown>;
}

/**
 * PRD §6, §8.2, AC21 — one scene row. PRD §3/§7.2/AC23 also calls for a
 * narration interval in scene details; that comes from a story this
 * skeleton does not model and is left out here rather than faked. The
 * requested duration and speed factor (record-speed-adjustment-factor,
 * JOS-148) are rendered below, read-only, when the backend sends them.
 *
 * PRD §10.3 — the correction form exists only for the failed visual stage
 * (`sceneActions`); it is never rendered-and-disabled otherwise, and its
 * presence is derived from state, never from a stored flag.
 *
 * show-scene-results-and-actions (JOS-151) — the details also show the
 * stored image and clip, and a failed scene's affected stage.
 */
export function SceneRow({ scene, paused, onRetry, onCorrect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const correctionStage = scene.affectedStage === "video" ? "video" : "image";
  const currentInstruction = correctionStage === "video"
    ? scene.videoInstruction ?? ""
    : scene.imageInstruction || scene.instruction || "";
  const [draftInstruction, setDraftInstruction] = useState(currentInstruction);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    setDraftInstruction(currentInstruction);
  }, [scene.sceneId, scene.state, scene.affectedStage, currentInstruction]);

  const isFailed = scene.state === "failed";
  const actions = sceneActions(scene);
  const isGenerating = scene.state === "image-generating" || scene.state === "video-generating";

  async function runAction(action: () => Promise<unknown>) {
    setPending(true);
    setRefusal(null);
    try {
      await action();
    } catch (error) {
      setRefusal(sceneRecoveryRefusalSentence(error instanceof Error ? error.message : ""));
    } finally {
      setPending(false);
    }
  }

  return (
    <li aria-label={`Scene ${scene.index}`} className={`scene-row ${sceneStatusClass(scene.state, scene.held)}`}>
      <span className="scene-summary">
        #{scene.index} — {scene.state}
      </span>
      {scene.held && <span className="scene-held"> — waiting for continue</span>}
      {paused && !scene.held && isGenerating && <span className="scene-generating"> — still generating</span>}
      {isFailed && <span role="alert"> {scene.errorCause}</span>}
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {expanded ? `Hide scene ${scene.index} details` : `View scene ${scene.index} details`}
      </button>

      {expanded && (
        <div className="scene-details">
          <dl>
            <dt>PROMPT</dt>
            <dd>{scene.prompt}</dd>
            <dt>IMAGE</dt>
            <dd>{scene.imageInstruction}</dd>
            <dt>VIDEO</dt>
            <dd>{scene.videoInstruction}</dd>
            {isFailed && scene.affectedStage && (
              <>
                <dt>Affected stage</dt>
                <dd>{scene.affectedStage}</dd>
              </>
            )}
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

          {/* JOS-166 — which provider each stage that has run used, and how many attempts it made. Read-only. */}
          {scene.stages.image && (
            <div role="group" aria-label={`Scene ${scene.index} image diagnostics`} className="stage-diagnostic">
              {formatStageDiagnostic(scene.stages.image)}
            </div>
          )}
          {scene.stages.video && (
            <div role="group" aria-label={`Scene ${scene.index} clip diagnostics`} className="stage-diagnostic">
              {formatStageDiagnostic(scene.stages.video)}
            </div>
          )}

          {scene.result?.imageUrl && (
            <img className="scene-image" src={resolveResultUrl(scene.result.imageUrl)} alt={`Scene ${scene.index} image`} />
          )}
          {scene.result?.videoUrl && (
            <video className="scene-clip" controls src={resolveResultUrl(scene.result.videoUrl)} aria-label={`Scene ${scene.index} clip`} />
          )}

          {actions.retry && (
            <button type="button" disabled={pending} onClick={() => runAction(() => onRetry(scene.sceneId))}>
              Retry scene {scene.index}
            </button>
          )}
          {(actions.correctImage || actions.correctVideo) && (
            <form
              aria-label={`Correct scene ${scene.index} ${correctionStage} instruction`}
              className="correction-form"
              onSubmit={(e) => {
                e.preventDefault();
                runAction(() => onCorrect(scene.sceneId, draftInstruction));
              }}
            >
              <label htmlFor={`correction-${scene.sceneId}`}>Corrected {correctionStage} instruction for scene {scene.index}</label>
              <textarea
                id={`correction-${scene.sceneId}`}
                value={draftInstruction}
                onChange={(e) => setDraftInstruction(e.target.value)}
              />
              <button type="submit" disabled={pending}>
                Save correction and retry
              </button>
            </form>
          )}
          {/* retry-or-correct-image (JOS-157), design Decision 7 — a 404/409 refusal shown as its sentence;
           * the scene's new state, on a success, arrives through the live update, not from here. */}
          {refusal && <p role="status">{refusal}</p>}

          {/* download-scene-results (JOS-163), design Decision 3 — a link renders
           * for exactly the entries the session read offers, never derived from
           * `state`: the image can be downloadable while the clip still isn't. */}
          {(scene.downloads?.imageUrl || scene.downloads?.clipUrl) && (
            <p className="download-links">
              {scene.downloads.imageUrl && <a href={resolveResultUrl(scene.downloads.imageUrl)}>Download scene {scene.index} image</a>}
              {scene.downloads.clipUrl && <a href={resolveResultUrl(scene.downloads.clipUrl)}>Download scene {scene.index} video</a>}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
