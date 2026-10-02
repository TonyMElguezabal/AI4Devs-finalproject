import type { SessionSnapshot } from "../types";

// Points at the `define-backend-stack` harness (JOS-179) directly — no
// third mock server (Decision 7 / task 4.2). Overridable for other harness
// ports via an env var, but defaults to the skeleton's documented port.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3100";

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.reason ?? body.error ?? `request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function createSession(input: {
  title: string;
  language: string;
  scenes: Array<{ mode: string; latencyMs: number; instruction: string }>;
}): Promise<SessionSnapshot> {
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

export function downloadFinalVideoUrl(sessionId: string): string {
  return `${API_BASE}/sessions/${sessionId}/download/final-video`;
}

export function eventsUrl(sessionId: string): string {
  return `${API_BASE}/events?sessionId=${encodeURIComponent(sessionId)}`;
}
