import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  deleteReferenceImage,
  getAppSettings,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_VISUAL_STYLE_PROMPT_CHARS,
  REFERENCE_IMAGE_TYPES,
  referenceImageUrl,
  saveVisualStylePrompt,
  uploadReferenceImage,
} from "../api/client";
import type { AppSettings } from "../types";

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * admin-visual-style-prompt (JOS-201), design Decision 9 — the visual style prompt and the optional reference image.
 * The image is stored for a later ticket (JOS-202): no provider receives it yet, and the page says so.
 */
export function AdminPage() {
  const [settings, setSettings] = useState<AppSettings | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [promptNotice, setPromptNotice] = useState<{ kind: "ok" | "error"; text: string } | undefined>(undefined);
  const [imageNotice, setImageNotice] = useState<{ kind: "ok" | "error"; text: string } | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then((loaded) => {
        setSettings(loaded);
        setPrompt(loaded.visualStylePrompt);
      })
      .catch((err) => setLoadError(messageOf(err)));
  }, []);

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!settings) return <p>Loading…</p>;

  const length = prompt.trim().length;
  const tooLong = length > MAX_VISUAL_STYLE_PROMPT_CHARS;

  const savePrompt = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setPromptNotice(undefined);
    try {
      // Only the prompt is taken from the answer: the typed text is kept as the user left it.
      setSettings(await saveVisualStylePrompt(prompt));
      setPromptNotice({ kind: "ok", text: "Prompt saved." });
    } catch (err) {
      setPromptNotice({ kind: "error", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const chooseImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setImageNotice(undefined);
    if (!REFERENCE_IMAGE_TYPES.includes(file.type)) {
      setImageNotice({ kind: "error", text: "Choose a PNG, JPEG or WebP image." });
    } else if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setImageNotice({ kind: "error", text: "The image must be 5 MB or smaller." });
    } else {
      setBusy(true);
      try {
        setSettings(await uploadReferenceImage(file));
        setImageNotice({ kind: "ok", text: "Image saved." });
      } catch (err) {
        setImageNotice({ kind: "error", text: messageOf(err) });
      } finally {
        setBusy(false);
      }
    }
    input.value = ""; // choosing the same file again must fire a change
  };

  const removeImage = async () => {
    setBusy(true);
    setImageNotice(undefined);
    try {
      await deleteReferenceImage();
      setSettings({ ...settings, referenceImage: null });
      setImageNotice({ kind: "ok", text: "Image removed." });
    } catch (err) {
      setImageNotice({ kind: "error", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const notice = (value: typeof promptNotice) =>
    value && (
      <p role={value.kind === "error" ? "alert" : "status"} className={value.kind === "error" ? "form-error" : undefined}>
        {value.text}
      </p>
    );

  return (
    <div className="start">
      <div className="start-head pop">
        <h1>Admin</h1>
        <p>One visual style for every new project. Projects already started keep the style they began with.</p>
      </div>

      <form onSubmit={savePrompt} aria-label="Visual style" className="start-form card pop">
        <div className="field">
          <label htmlFor="visual-style-prompt">Visual style prompt</label>
          <textarea id="visual-style-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={12} aria-describedby="visual-style-hint" />
          <small id="visual-style-hint">
            Describe the art style and any recurring characters. It guides the image and video instructions of every scene. The pipeline rules (one
            instruction pair per script fragment, in the required JSON format) always apply: if this text conflicts with them, these rules win.
          </small>
          <small>{`${length} / ${MAX_VISUAL_STYLE_PROMPT_CHARS}`}</small>
        </div>
        {notice(promptNotice)}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={busy || tooLong}>
            Save prompt
          </button>
        </div>
      </form>

      <section aria-label="Reference image settings" className="start-form card pop">
        <div className="field">
          <label htmlFor="reference-image">Reference image</label>
          <input id="reference-image" type="file" accept={REFERENCE_IMAGE_TYPES.join(",")} onChange={chooseImage} disabled={busy} />
          <small>PNG, JPEG or WebP, up to 5 MB. It is stored, but not sent to the image provider yet.</small>
        </div>
        {settings.referenceImage && (
          <div className="field">
            <img className="reference-preview" alt="Reference image preview" src={referenceImageUrl(settings.referenceImage.updatedAt)} />
            <div className="form-actions">
              <button type="button" onClick={removeImage} disabled={busy}>
                Remove image
              </button>
            </div>
          </div>
        )}
        {notice(imageNotice)}
      </section>
    </div>
  );
}
