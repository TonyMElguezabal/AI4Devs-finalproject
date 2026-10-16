import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TelemetryChoices, TelemetryConsent } from "../types";

interface Props {
  open: boolean;
  /** Absent until `GET /telemetry/consent` has answered; nothing renders then. */
  consent: TelemetryConsent | undefined;
  onSave: (choices: TelemetryChoices) => Promise<void>;
  onClose: () => void;
}

const SIGNALS: Array<{ key: keyof TelemetryChoices; label: string; help: string }> = [
  { key: "errors", label: "Send error reports", help: "What failed and where, with file paths and your user name removed." },
  { key: "providerUsage", label: "Send provider usage and cost counts", help: "How many provider calls ran, how long they took and how much was billed." },
  { key: "productUsage", label: "Send anonymous usage counts", help: "How often the app starts, sessions begin and final videos are made." },
];

/**
 * add-observability-telemetry (JOS-199), design Decision 10 — a native <dialog>: the browser traps focus and Escape
 * closes it without saving. Every box starts unchecked; nothing is sent until the user saves a choice.
 */
export function TelemetryConsentDialog({ open, consent, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState<TelemetryChoices>({ errors: false, providerUsage: false, productUsage: false });
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (consent) setChoices({ errors: consent.errors, providerUsage: consent.providerUsage, productUsage: consent.productUsage });
      setError(undefined);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, consent]);

  if (!consent) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await onSave(choices);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="privacy-dialog"
      aria-labelledby="privacy-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form onSubmit={handleSubmit}>
        <h2 id="privacy-dialog-title">Help improve Vid4You</h2>
        <p>Nothing is sent unless you turn it on here. No script, media, file name or key is ever sent. You can change this at any time from Privacy.</p>
        {SIGNALS.map(({ key, label, help }) => (
          <div className="privacy-choice" key={key}>
            <input
              id={`privacy-${key}`}
              type="checkbox"
              checked={choices[key]}
              onChange={(event) => setChoices({ ...choices, [key]: event.target.checked })}
            />
            <label htmlFor={`privacy-${key}`}>{label}</label>
            <small>{help}</small>
          </div>
        ))}
        {error && <p role="alert">{error}</p>}
        <div className="privacy-actions">
          <button type="button" onClick={onClose}>
            Not now
          </button>
          <button type="submit" className="primary" disabled={saving}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
