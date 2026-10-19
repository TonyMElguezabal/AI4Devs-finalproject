import type { AppSettings, AppUpdate, SceneEventPayload, SessionSnapshot, TelemetryChoices, TelemetryConsent } from "../types";

// Points at the `define-backend-stack` harness (JOS-179) directly — no
// third mock server (Decision 7 / task 4.2). Overridable for other harness
// ports via an env var, but defaults to the skeleton's documented port.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3100";

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // `reason` (this app's own {ok:false, reason} shape) first, then Zod's
    // validation `message` (the actual cause — start-video-project, JOS-134,
    // Decision 6/§4.1 requires the cause named, not swallowed by Fastify's
    // generic `error: "Bad Request"` field), then that generic field last.
    throw new Error(body.reason ?? body.message ?? body.error ?? `request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface SupportedLanguage {
  code: string;
  label: string;
}

/** start-video-project (JOS-134) Decision 5 — fetched, never a second
 * hardcoded copy of the backend's list. */
export function fetchLanguages(): Promise<SupportedLanguage[]> {
  return fetch(`${API_BASE}/languages`).then(asJson<SupportedLanguage[]>);
}

export function createSession(input: { title: string; script: string; language: string }): Promise<SessionSnapshot> {
  return fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(asJson<SessionSnapshot>);
}

export function fetchSnapshot(sessionId: string): Promise<SessionSnapshot> {
  return fetch(`${API_BASE}/sessions/${sessionId}`).then(asJson<SessionSnapshot>);
}

export function pauseSession(sessionId: string): Promise<{ ok: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/pause`, { method: "POST" }).then(asJson<{ ok: boolean }>);
}

export function continueSession(sessionId: string): Promise<{ ok: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/continue`, { method: "POST" }).then(asJson<{ ok: boolean }>);
}

export function retryDecomposition(sessionId: string): Promise<{ ok: true; held: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/decomposition/retry`, { method: "POST" }).then(asJson<{ ok: true; held: boolean }>);
}

export function retryAssembly(sessionId: string): Promise<{ ok: true; held: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/assembly/retry`, { method: "POST" }).then(asJson<{ ok: true; held: boolean }>);
}

/** adjust-scene-pause (JOS-190) — sets the silence after a scene; resolves with the updated scene, rejects with the sentence or reason. */
export function setScenePause(sessionId: string, sceneId: string, seconds: number): Promise<SceneEventPayload> {
  return fetch(`${API_BASE}/sessions/${sessionId}/scenes/${sceneId}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seconds }),
  }).then(asJson<SceneEventPayload>);
}

/** adjust-scene-pause (JOS-190) — assembles a new version of the final video with the stored pause edits. */
export function rebuildFinalVideo(sessionId: string): Promise<{ ok: true; held: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/final-video/rebuild`, { method: "POST" }).then(asJson<{ ok: true; held: boolean }>);
}

export function retryScene(sessionId: string, sceneId: string): Promise<{ ok: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/scenes/${sceneId}/retry`, { method: "POST" }).then(asJson<{ ok: boolean }>);
}

export function correctScene(sessionId: string, sceneId: string, instruction: string): Promise<{ ok: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/scenes/${sceneId}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction }),
  }).then(asJson<{ ok: boolean }>);
}

/** A result URL in the session payload is a path relative to the API base. */
export function resolveResultUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function eventsUrl(sessionId: string): string {
  return `${API_BASE}/events?sessionId=${encodeURIComponent(sessionId)}`;
}

/** add-observability-telemetry (JOS-199) */
export function getTelemetryConsent(): Promise<TelemetryConsent> {
  return fetch(`${API_BASE}/telemetry/consent`).then(asJson<TelemetryConsent>);
}

export function saveTelemetryConsent(choices: TelemetryChoices): Promise<TelemetryConsent> {
  return fetch(`${API_BASE}/telemetry/consent`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(choices),
  }).then(asJson<TelemetryConsent>);
}

export function getAppUpdate(): Promise<AppUpdate> {
  return fetch(`${API_BASE}/app/update`).then(asJson<AppUpdate>);
}

/** admin-visual-style-prompt (JOS-201) */
export const MAX_VISUAL_STYLE_PROMPT_CHARS = 8000;
export const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
export const REFERENCE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function getAppSettings(): Promise<AppSettings> {
  return fetch(`${API_BASE}/admin/settings`).then(asJson<AppSettings>);
}

export function saveVisualStylePrompt(visualStylePrompt: string): Promise<AppSettings> {
  return fetch(`${API_BASE}/admin/settings/visual-style-prompt`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visualStylePrompt }),
  }).then(asJson<AppSettings>);
}

export function uploadReferenceImage(file: File): Promise<AppSettings> {
  return fetch(`${API_BASE}/admin/settings/reference-image`, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  }).then(asJson<AppSettings>);
}

export async function deleteReferenceImage(): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/settings/reference-image`, { method: "DELETE" });
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
}

/** `version` busts the browser cache when the image is replaced. */
export function referenceImageUrl(version: string): string {
  return `${API_BASE}/admin/settings/reference-image?v=${encodeURIComponent(version)}`;
}
