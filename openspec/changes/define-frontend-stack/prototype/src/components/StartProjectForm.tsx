import { useState, type FormEvent } from "react";
import { SUPPORTED_LANGUAGES } from "../types";

export interface StartProjectValues {
  title: string;
  script: string;
  language: string;
}

interface Props {
  onStart: (values: StartProjectValues) => void;
  submitting?: boolean;
}

/** PRD §4.1, AC01 — title, script, and a language selector limited to the
 * hardcoded list; a project cannot start without a language. */
export function StartProjectForm({ onStart, submitting }: Props) {
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
    <form onSubmit={handleSubmit} aria-label="Start a project">
      <div>
        <label htmlFor="project-title">Title</label>
        <input id="project-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="project-script">Script</label>
        <textarea id="project-script" value={script} onChange={(e) => setScript(e.target.value)} rows={8} />
      </div>
      <div>
        <label htmlFor="project-language">Language</label>
        <select id="project-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">Select a language</option>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={!canSubmit || submitting}>
        Start project
      </button>
    </form>
  );
}
