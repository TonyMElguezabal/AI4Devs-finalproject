import { useEffect, useState } from "react";
import type { SceneEventPayload, SessionState } from "../types";
import { sceneStatusClass } from "../styles/status";
import { sceneActions } from "../sceneActions";
import { resolveResultUrl } from "../api/client";
import { formatStageDiagnostic } from "../stageDiagnostics";
import { sceneRecoveryRefusalSentence } from "../sceneRecoveryRefusals";
import { AFFECTED_STAGE_LABEL, DURATION_WARNING_TEXT, SCENE_STATE_LABEL, SPEED_WARNING_TEXT } from "../statusLabels";
import { Icon } from "./Icon";
import { PauseDial } from "./PauseDial";
import { VideoRequestStatus } from "./VideoRequestStatus";
import { StatusPill } from "./StatusPill";

/** rebuild-scene (JOS-235) — rebuilds a scene's image and clip; only the instructions the User changed are passed. Rejects with the refusal reason. */
export type SceneRebuildHandler = (sceneId: string, instructions: { imageInstruction?: string; videoInstruction?: string }) => Promise<unknown>;

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
  /** Rebuilds the scene (rebuild-scene, JOS-235). Absent: the action is not offered. */
  onRebuild?: SceneRebuildHandler;
  /** The session's state: a scene cannot be rebuilt while the final video is being assembled. */
  sessionState?: SessionState;
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
export function SceneRow({ scene, paused, onRetry, onCorrect, onSetPause, onRebuild, sessionState }: Props) {
  const [expanded, setExpanded] = useState(false);
  const correctionStage = scene.affectedStage === "video" ? "video" : "image";
  const currentInstruction = correctionStage === "video"
    ? scene.videoInstruction ?? ""
    : scene.imageInstruction || scene.instruction || "";
  const [draftInstruction, setDraftInstruction] = useState(currentInstruction);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const storedImageInstruction = scene.imageInstruction || scene.instruction || "";
  const storedVideoInstruction = scene.videoInstruction ?? "";
  const [imageDraft, setImageDraft] = useState(storedImageInstruction);
  const [videoDraft, setVideoDraft] = useState(storedVideoInstruction);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the draft when the scene or its affected stage changes
    setDraftInstruction(currentInstruction);
  }, [scene.sceneId, scene.state, scene.affectedStage, currentInstruction]);

  const isFailed = scene.state === "failed";
  const actions = sceneActions(scene, sessionState);
  const canRebuild = actions.rebuild && Boolean(onRebuild);
  const isGenerating = scene.state === "image-generating" || scene.state === "video-generating";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the form closes as soon as the scene can no longer be rebuilt (it is generating, or the final video is being assembled)
    if (!canRebuild) setRebuildOpen(false);
  }, [canRebuild]);

  /** Runs a scene command; true when it was accepted. A refusal is shown as its sentence. */
  async function runAction(action: () => Promise<unknown>): Promise<boolean> {
    setPending(true);
    setRefusal(null);
    try {
      await action();
      return true;
    } catch (error) {
      setRefusal(sceneRecoveryRefusalSentence(error instanceof Error ? error.message : ""));
      return false;
    } finally {
      setPending(false);
    }
  }

  function openRebuildForm() {
    setImageDraft(storedImageInstruction);
    setVideoDraft(storedVideoInstruction);
    setRefusal(null);
    setRebuildOpen(true);
  }

  // Only what the User changed is sent; a changed instruction must not be empty (the backend refuses it too).
  const rebuildChanges = {
    ...(imageDraft.trim() !== storedImageInstruction.trim() ? { imageInstruction: imageDraft.trim() } : {}),
    ...(videoDraft.trim() !== storedVideoInstruction.trim() ? { videoInstruction: videoDraft.trim() } : {}),
  };
  const rebuildHasEmptyChange = Object.values(rebuildChanges).some((value) => value === "");

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
            {/* show-video-request-status (JOS-200) — the request sent for a clip that is still generating. */}
            {scene.videoRequest && <VideoRequestStatus sceneIndex={scene.index} request={scene.videoRequest} />}

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
            {/* rebuild-scene (JOS-235), Decision 9 — derived from state, never rendered-and-disabled; an inline form, not a browser dialog. */}
            {canRebuild && !rebuildOpen && (
              <button type="button" onClick={openRebuildForm}>
                <Icon name="retry" />
                Rebuild scene {scene.index}
              </button>
            )}
            {canRebuild && rebuildOpen && (
              <form
                aria-label={`Rebuild scene ${scene.index}`}
                className="correction-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAction(() => onRebuild!(scene.sceneId, rebuildChanges)).then((accepted) => {
                    if (accepted) setRebuildOpen(false);
                  });
                }}
              >
                <p>
                  The image and the clip are generated again by the providers, which costs one request each. The rest of the session is kept and
                  the final video is then rebuilt.
                </p>
                <label htmlFor={`rebuild-image-${scene.sceneId}`}>IMAGE instruction for scene {scene.index}</label>
                <textarea id={`rebuild-image-${scene.sceneId}`} value={imageDraft} onChange={(e) => setImageDraft(e.target.value)} />
                <label htmlFor={`rebuild-video-${scene.sceneId}`}>VIDEO instruction for scene {scene.index}</label>
                <textarea id={`rebuild-video-${scene.sceneId}`} value={videoDraft} onChange={(e) => setVideoDraft(e.target.value)} />
                <div className="rebuild-actions">
                  <button type="submit" className="primary" disabled={pending || rebuildHasEmptyChange}>
                    Rebuild image and clip
                  </button>
                  <button type="button" disabled={pending} onClick={() => setRebuildOpen(false)}>
                    Cancel
                  </button>
                </div>
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
