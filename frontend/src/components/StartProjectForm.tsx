import { useState, type FormEvent } from "react";

export interface StartProjectValues {
  title: string;
  script: string;
  language: string;
}

export interface SupportedLanguage {
  code: string;
  label: string;
}

interface Props {
  onStart: (values: StartProjectValues) => void;
  /** Fetched from the backend's `GET /languages` (App.tsx), never a second
   * hardcoded copy (start-video-project, JOS-134, Decision 5) — one source
   * of truth for the supported list, avoiding the two drifting apart. */
  languages: SupportedLanguage[];
  submitting?: boolean;
  /** A refused or failed submission, shown inside the card, above the button that submits it. */
  error?: string;
}

/** PRD §4.1, AC01 — title, script, and a language selector limited to the
 * hardcoded list; a project cannot start without a language.
 *
 * redesign-visual-design (JOS-198), Decision 4 — one card under a short heading; labels and the form's name
 * are unchanged. */
export function StartProjectForm({ onStart, languages, submitting, error }: Props) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [language, setLanguage] = useState("");

  const canSubmit = title.trim().length > 0 && script.trim().length > 0 && language.length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onStart({ title, script, language });
  }

  return (
    <div className="start">
      <div className="start-head pop">
        <h1>Turn a script into a narrated video</h1>
        <p>
          Paste your script and pick the narration language. Vid4You records the voice-over, splits it into scenes, and generates an image
          and a clip for each.
        </p>
      </div>
      <form onSubmit={handleSubmit} aria-label="Start a project" className="start-form card pop">
        <div className="field">
          <label htmlFor="project-title">Title</label>
          <input id="project-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="project-script">Script</label>
          <textarea id="project-script" value={script} onChange={(e) => setScript(e.target.value)} rows={8} />
        </div>
        <div className="field">
          <label htmlFor="project-language">Language</label>
          <select id="project-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Select a language</option>
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="primary large" disabled={!canSubmit || submitting}>
            Start project
          </button>
        </div>
      </form>
    </div>
  );
}
