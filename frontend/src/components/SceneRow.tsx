import { useEffect, useState } from "react";
import type { SceneEventPayload } from "../types";
import { sceneStatusClass } from "../styles/status";
import { sceneActions } from "../sceneActions";
import { resolveResultUrl } from "../api/client";
import { formatStageDiagnostic } from "../stageDiagnostics";
import { sceneRecoveryRefusalSentence } from "../sceneRecoveryRefusals";
import { AFFECTED_STAGE_LABEL, DURATION_WARNING_TEXT, SCENE_STATE_LABEL, SPEED_WARNING_TEXT } from "../statusLabels";
import { Icon } from "./Icon";
import { PauseDial } from "./PauseDial";
import { StatusPill } from "./StatusPill";

interface Props {
  scene: SceneEventPayload;
  /** distinguish-paused-session (JOS-153), design Decision 6 — whether the session is paused; decides between
   * "waiting for continue" (held) and "still generating" (sent before the pause, not held). */
  paused?: boolean;
  /** Starts a scene retry; rejects with the refusal reason (retry-or-correct-image, JOS-157). */
  onRetry: (sceneId: string) => Promise<unknown>;
  /** Corrects IMAGE and retries; rejects with the refusal reason. */
  onCorrect: (sceneId: string, instruction: string) => Promise<unknown>;
  /** Sets the silence after this scene (adjust-scene-pause, JOS-190); rejects with the refusal. Absent: no dial is offered. */
  onSetPause?: (sceneId: string, seconds: number) => Promise<unknown>;
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
 *
 * redesign-visual-design (JOS-198), Decision 5 — a card: a decorative thumbnail, the plain-language label in a
 * pill, and the unchanged details toggle. Expanded, the card spans the row and shows the named image in place of
 * the thumbnail, so a scene never has two images.
 */
export function SceneRow({ scene, paused, onRetry, onCorrect, onSetPause }: Props) {
  const [expanded, setExpanded] = useState(false);
  const correctionStage = scene.affectedStage === "video" ? "video" : "image";
  const currentInstruction = correctionStage === "video"
    ? scene.videoInstruction ?? ""
    : scene.imageInstruction || scene.instruction || "";
  const [draftInstruction, setDraftInstruction] = useState(currentInstruction);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the draft when the scene or its affected stage changes
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

  const imageUrl = scene.result?.imageUrl;
  const hasMedia = Boolean(scene.result?.imageUrl || scene.result?.videoUrl || scene.downloads?.imageUrl || scene.downloads?.clipUrl);
  const statusClass = sceneStatusClass(scene.state, scene.held);

  return (
    <li aria-label={`Scene ${scene.index}`} className={`scene-row pop ${statusClass}${expanded ? " open" : ""}`}>
      {!expanded && (
        <div className={`scene-thumb${!imageUrl && scene.state === "image-generating" ? " shimmer" : ""}`}>
          {imageUrl ? <img src={resolveResultUrl(imageUrl)} alt="" /> : <Icon name={isFailed ? "failed" : "queued"} />}
          <span className="scene-index" aria-hidden="true">
            {scene.index}
          </span>
        </div>
      )}
      <div className="scene-body">
        <div className="scene-line">
          <StatusPill statusClass={statusClass} label={SCENE_STATE_LABEL[scene.state]} />
          {scene.requestedDurationSeconds !== undefined && <span className="scene-duration">{scene.requestedDurationSeconds} s</span>}
        </div>
        {scene.held && <span className="scene-held">Waiting for continue</span>}
        {paused && !scene.held && isGenerating && <span className="scene-generating">Still generating</span>}
        {isFailed && (
          <span role="alert" className="scene-error">
            {scene.errorCause}
          </span>
        )}
        <button type="button" className="toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <Icon name="chevron" />
          {expanded ? `Hide scene ${scene.index} details` : `View scene ${scene.index} details`}
        </button>
      </div>

      {expanded && (
        <div className="scene-details">
          {hasMedia && (
            <div className="scene-media">
              {scene.result?.imageUrl && (
                <img className="scene-image" src={resolveResultUrl(scene.result.imageUrl)} alt={`Scene ${scene.index} image`} />
              )}
              {scene.result?.videoUrl && (
                <video className="scene-clip" controls src={resolveResultUrl(scene.result.videoUrl)} aria-label={`Scene ${scene.index} clip`} />
              )}
              {/* download-scene-results (JOS-163), design Decision 3 — a link renders
               * for exactly the entries the session read offers, never derived from
               * `state`: the image can be downloadable while the clip still isn't. */}
              {(scene.downloads?.imageUrl || scene.downloads?.clipUrl) && (
                <p className="download-links">
                  {scene.downloads.imageUrl && (
                    <a className="button" href={resolveResultUrl(scene.downloads.imageUrl)}>
                      <Icon name="download" />
                      Download scene {scene.index} image
                    </a>
                  )}
                  {scene.downloads.clipUrl && (
                    <a className="button" href={resolveResultUrl(scene.downloads.clipUrl)}>
                      <Icon name="download" />
                      Download scene {scene.index} video
                    </a>
                  )}
                </p>
              )}
            </div>
          )}

          <div className="scene-info">
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
                  <dd>{AFFECTED_STAGE_LABEL[scene.affectedStage]}</dd>
                </>
              )}
              {scene.requestedDurationSeconds !== undefined && (
                <>
                  <dt>Requested duration</dt>
                  <dd>{scene.requestedDurationSeconds}</dd>
                </>
              )}
              {scene.speedFactor !== undefined && (
                <>
                  <dt>Speed factor</dt>
                  <dd>{scene.speedFactor}</dd>
                </>
              )}
            </dl>
            {scene.pause && onSetPause && (
              <PauseDial sceneIndex={scene.index} pause={scene.pause} onSetPause={(seconds) => onSetPause(scene.sceneId, seconds)} />
            )}
            {scene.durationWarning && (
              <div className="callout callout-warn">
                <Icon name="failed" />
                <p role="alert">{DURATION_WARNING_TEXT}</p>
              </div>
            )}
            {scene.speedFactorWarning && (
              <div className="callout callout-warn">
                <Icon name="failed" />
                <p role="alert">{SPEED_WARNING_TEXT}</p>
              </div>
            )}

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

            {actions.retry && (
              <button type="button" disabled={pending} onClick={() => void runAction(() => onRetry(scene.sceneId))}>
                <Icon name="retry" />
                Retry scene {scene.index}
              </button>
            )}
            {(actions.correctImage || actions.correctVideo) && (
              <form
                aria-label={`Correct scene ${scene.index} ${correctionStage} instruction`}
                className="correction-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAction(() => onCorrect(scene.sceneId, draftInstruction));
                }}
              >
                <label htmlFor={`correction-${scene.sceneId}`}>Corrected {correctionStage} instruction for scene {scene.index}</label>
                <textarea
                  id={`correction-${scene.sceneId}`}
                  value={draftInstruction}
                  onChange={(e) => setDraftInstruction(e.target.value)}
                />
                <button type="submit" className="primary" disabled={pending}>
                  Save correction and retry
                </button>
              </form>
            )}
            {/* retry-or-correct-image (JOS-157), design Decision 7 — a 404/409 refusal shown as its sentence;
             * the scene's new state, on a success, arrives through the live update, not from here. */}
            {refusal && <p role="status">{refusal}</p>}
          </div>
        </div>
      )}
    </li>
  );
}
