import type { SessionSnapshot } from "../types";

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

export function downloadSceneUrl(sessionId: string, sceneId: string, kind: "image" | "video"): string {
  return `${API_BASE}/sessions/${sessionId}/scenes/${sceneId}/download/${kind}`;
}

/** A result URL in the session payload is a path relative to the API base. */
export function resolveResultUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function downloadFinalVideoUrl(sessionId: string): string {
  return `${API_BASE}/sessions/${sessionId}/download/final-video`;
}

export function eventsUrl(sessionId: string): string {
  return `${API_BASE}/events?sessionId=${encodeURIComponent(sessionId)}`;
}
