/**
 * PRD §4.1, D09 — the hardcoded supported script-language list. A session
 * cannot be registered without a language from this list, and no provider is
 * called before one is selected.
 *
 * PROVISIONAL, not the real product decision: `define-provider-configuration`
 * (US-33, JOS-165) owns the real hardcoded value and has not run yet (0/98
 * tasks — start-video-project, JOS-134, task 1.4). This list mirrors the
 * placeholder the frontend prototype already used for the same reason
 * (`openspec/changes/archive/2026-09-26-define-frontend-stack/prototype/src/types.ts`),
 * kept in sync here as the single source of truth (Decision 5 — the frontend
 * fetches this list via `GET /languages` rather than restating it). Replace
 * wholesale once JOS-165 lands; do not extend or tune it in the meantime.
 */
export const SUPPORTED_LANGUAGE_CODES = ["en", "es", "fr", "de", "pt"] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export const SUPPORTED_LANGUAGES: ReadonlyArray<{ code: SupportedLanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
];
