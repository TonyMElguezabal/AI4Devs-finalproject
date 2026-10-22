import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  deleteReferenceImage,
  getAppSettings,
  getReferenceImage,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_VISUAL_STYLE_PROMPT_CHARS,
  REFERENCE_IMAGE_TYPES,
  saveVisualStylePrompt,
  uploadReferenceImage,
} from "../api/client";
import type { AppSettings } from "../types";
import type { AdminToolsContext } from "./AdminPage";

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * admin-visual-style-prompt (JOS-201), design Decision 9 — the visual style prompt and the optional reference image,
 * one of the Administrator tools behind the password (protect-admin-with-password, JOS-173). The image is stored for
 * a later ticket (JOS-202): no provider receives it yet, and the section says so.
 */
export function VisualStyleSection({ password, onDenied }: AdminToolsContext) {
  const [settings, setSettings] = useState<AppSettings | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [promptNotice, setPromptNotice] = useState<{ kind: "ok" | "error"; text: string } | undefined>(undefined);
  const [imageNotice, setImageNotice] = useState<{ kind: "ok" | "error"; text: string } | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    getAppSettings(password)
      .then((result) => {
        if (result.kind === "denied") return onDenied();
        setSettings(result.settings);
        setPrompt(result.settings.visualStylePrompt);
      })
      .catch((err) => setLoadError(messageOf(err)));
    // The password and the lock callback do not change while the section is shown.
  }, []);

  // An `<img src>` cannot send the password, so the stored image is fetched and shown as an object URL.
  const imageVersion = settings?.referenceImage?.updatedAt;
  useEffect(() => {
    if (!imageVersion) return; // with no stored image the preview is not shown, so a stale URL is never displayed
    let url: string | undefined;
    let cancelled = false;
    getReferenceImage(password)
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "denied") return onDenied();
        url = URL.createObjectURL(result.image);
        setPreviewUrl(url);
      })
      .catch((err) => !cancelled && setImageNotice({ kind: "error", text: messageOf(err) }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageVersion]);

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!settings) return <p className="session-loading">Loading the visual style…</p>;

  const length = prompt.trim().length;
  const tooLong = length > MAX_VISUAL_STYLE_PROMPT_CHARS;

  const savePrompt = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setPromptNotice(undefined);
    try {
      // Only the prompt is taken from the answer: the typed text is kept as the user left it.
      const result = await saveVisualStylePrompt(password, prompt);
      if (result.kind === "denied") return onDenied();
      setSettings(result.settings);
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
        const result = await uploadReferenceImage(password, file);
        if (result.kind === "denied") return onDenied();
        setSettings(result.settings);
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
      if ((await deleteReferenceImage(password)).kind === "denied") return onDenied();
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
    <section aria-label="Visual style" className="field">
      <h2>Visual style</h2>
      <p>One visual style for every new project. Projects already started keep the style they began with.</p>

      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises -- savePrompt catches its own failure */}
      <form onSubmit={savePrompt} aria-label="Visual style prompt form">
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

      <section aria-label="Reference image settings">
        <div className="field">
          <label htmlFor="reference-image">Reference image</label>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises -- chooseImage catches its own failure */}
          <input id="reference-image" type="file" accept={REFERENCE_IMAGE_TYPES.join(",")} onChange={chooseImage} disabled={busy} />
          <small>PNG, JPEG or WebP, up to 5 MB. It is stored, but not sent to the image provider yet.</small>
        </div>
        {settings.referenceImage && (
          <div className="field">
            {previewUrl && <img className="reference-preview" alt="Reference image preview" src={previewUrl} />}
            <div className="form-actions">
              {/* eslint-disable-next-line @typescript-eslint/no-misused-promises -- removeImage catches its own failure */}
              <button type="button" onClick={removeImage} disabled={busy}>
                Remove image
              </button>
            </div>
          </div>
        )}
        {notice(imageNotice)}
      </section>
    </section>
  );
}
