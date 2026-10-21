import { useEffect, useRef, useState } from "react";
import { pauseRefusalSentence } from "../pauseRefusals";
import type { ScenePauseView } from "../types";

interface Props {
  sceneIndex: number;
  pause: ScenePauseView;
  /** Saves the value; rejects with the refusal reason or sentence. The new value arrives through the live update. */
  onSetPause: (seconds: number) => Promise<unknown>;
}

// The product's own bounds (adjust-scene-pause, JOS-190); the numeric speed-factor limit is deliberately not here — it
// lives in the backend, and the page says "the speed-factor limit".
const FLOOR_SECONDS = 0.2;
const CAP_SECONDS = 3.0;
const EPSILON = 1e-9;
const oneDecimal = (seconds: number): string => seconds.toFixed(1);

/**
 * The silence after a scene, adjustable within the range the session read gives. The saved value always comes from the
 * read (`pause.seconds`); the field is only a draft until it is left or Enter is pressed.
 */
export function PauseDial({ sceneIndex, pause, onSetPause }: Props) {
  const [draft, setDraft] = useState(String(pause.seconds));
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Enter saves and disables the field, which blurs it, which would save again: one request per change.
  const saving = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the field when the saved pause changes
    setDraft(String(pause.seconds));
  }, [pause.seconds]);

  async function save(seconds: number) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setRefusal(null);
    try {
      await onSetPause(seconds);
    } catch (error) {
      setRefusal(pauseRefusalSentence(error instanceof Error ? error.message : ""));
      setDraft(String(pause.seconds));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  function commit() {
    const value = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(value)) {
      setDraft(String(pause.seconds));
      return;
    }
    if (Math.abs(value - pause.seconds) < EPSILON) return;
    void save(value);
  }

  const id = `pause-${sceneIndex}`;
  const floorLimited = pause.limitedBySpeedFactor && pause.minSeconds > FLOOR_SECONDS + EPSILON;
  const capLimited = pause.limitedBySpeedFactor && pause.maxSeconds < CAP_SECONDS - EPSILON;

  return (
    <div className="pause-dial">
      <label htmlFor={id}>Pause after scene {sceneIndex}</label>
      <div className="pause-dial-row">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={pause.minSeconds}
          max={pause.maxSeconds}
          step={0.1}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
        />
        <span className="pause-unit">s</span>
        <button type="button" disabled={pending || Math.abs(pause.seconds - pause.originalSeconds) < EPSILON} onClick={() => void save(pause.originalSeconds)}>
          Reset scene {sceneIndex} pause
        </button>
      </div>
      <p className="pause-range">
        From {oneDecimal(pause.minSeconds)} s to {oneDecimal(pause.maxSeconds)} s, in steps of 0.1 s. Originally {oneDecimal(pause.originalSeconds)} s.
      </p>
      {floorLimited && (
        <p className="pause-note">
          Shorter than {oneDecimal(pause.minSeconds)} s would speed this scene's clip past the speed-factor limit.
        </p>
      )}
      {capLimited && (
        <p className="pause-note">
          Longer than {oneDecimal(pause.maxSeconds)} s would slow this scene's clip past the speed-factor limit.
        </p>
      )}
      {refusal && <p role="status">{refusal}</p>}
    </div>
  );
}
