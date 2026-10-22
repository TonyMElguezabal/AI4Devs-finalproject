import type { AdapterTypeInfo, AppUpdate, FailedStageRow, ProfileProblem, ProfileView, ProviderStage, ProviderView, SceneEventPayload, SessionSnapshot, TelemetryChoices, TelemetryConsent } from "../types";

// Points at the `define-backend-stack` harness (JOS-179) directly — no
// third mock server (Decision 7 / task 4.2). Overridable for other harness
// ports via an env var, but defaults to the skeleton's documented port.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:3100";

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { reason?: string; message?: string; error?: string };
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

export function retryVoiceOver(sessionId: string): Promise<{ ok: true; held: boolean }> {
  return fetch(`${API_BASE}/sessions/${sessionId}/voice-over/retry`, { method: "POST" }).then(asJson<{ ok: true; held: boolean }>);
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

/** protect-admin-with-password (JOS-173) — why the backend refused an Administrator request (design Decision 3). */
export type AdminDenial = "not-configured" | "password-required" | "wrong-password";

export type AdminAccessResult = { kind: "granted" } | { kind: "denied"; reason: AdminDenial };

/**
 * protect-admin-with-password (JOS-173), design Decision 2 — every Administrator request carries the password as
 * `Authorization: Bearer <password>`; the backend keeps no login state. JOS-171 and JOS-172 call this too. The
 * caller holds the password in memory only; this never stores it.
 */
export function adminFetch(path: string, password: string | undefined, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (password) headers.set("Authorization", `Bearer ${password}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

const ADMIN_DENIALS: readonly string[] = ["not-configured", "password-required", "wrong-password"];

/** `GET /admin/access`: granted, or the reason it was refused. Any other failure rejects. */
export async function getAdminAccess(password?: string): Promise<AdminAccessResult> {
  const response = await adminFetch("/admin/access", password);
  if (response.ok) return { kind: "granted" };
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && ADMIN_DENIALS.includes(body.reason)) return { kind: "denied", reason: body.reason as AdminDenial };
  throw new Error(`request failed with ${response.status}`);
}

export type AdminProvidersResult = { kind: "ok"; providers: ProviderView[] } | { kind: "denied" };
export type AdminProviderChangeResult = { kind: "ok"; view: ProviderView } | { kind: "denied" } | { kind: "refused"; selectable: string[] };

/** change-active-provider-from-admin (JOS-171): `GET /admin/providers`. A 401 is `denied`; any other failure rejects. */
export async function getAdminProviders(password: string): Promise<AdminProvidersResult> {
  const response = await adminFetch("/admin/providers", password);
  if (response.status === 401) return { kind: "denied" };
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  return { kind: "ok", providers: (await response.json()).providers as ProviderView[] };
}

/** `PUT /admin/providers/{stage}`: the stage's new view, a 401 (`denied`), or a 400 naming the selectable ids (`refused`). */
export async function putAdminProvider(password: string, stage: ProviderStage, providerId: string): Promise<AdminProviderChangeResult> {
  const response = await adminFetch(`/admin/providers/${stage}`, password, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
  if (response.status === 401) return { kind: "denied" };
  if (response.status === 400) {
    const body = await response.json().catch(() => ({}));
    return { kind: "refused", selectable: Array.isArray(body.selectable) ? body.selectable : [] };
  }
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  return { kind: "ok", view: (await response.json()) as ProviderView };
}

export type ProfilesResult = { kind: "ok"; types: AdapterTypeInfo[]; profiles: ProfileView[] } | { kind: "denied" };
export type ProfileWriteResult =
  | { kind: "ok" }
  | { kind: "denied" }
  | { kind: "invalid"; problems: ProfileProblem[] }
  | { kind: "not-found" }
  | { kind: "active"; stage: ProviderStage };
export type ProfileDeleteResult = { kind: "removed" } | { kind: "retired" } | Exclude<ProfileWriteResult, { kind: "ok" } | { kind: "invalid" }>;

/** manage-providers-from-admin (JOS-218): the adapter types and the profiles. A 401 is `denied`; any other failure rejects. */
export async function getProviderProfiles(password: string): Promise<ProfilesResult> {
  const [types, profiles] = await Promise.all([adminFetch("/admin/provider-types", password), adminFetch("/admin/provider-profiles", password)]);
  if (types.status === 401 || profiles.status === 401) return { kind: "denied" };
  if (!types.ok || !profiles.ok) throw new Error(`request failed with ${types.ok ? profiles.status : types.status}`);
  return { kind: "ok", types: (await types.json()).types as AdapterTypeInfo[], profiles: (await profiles.json()).profiles as ProfileView[] };
}

async function writeProfile(response: Response): Promise<ProfileWriteResult> {
  if (response.status === 401) return { kind: "denied" };
  if (response.status === 404) return { kind: "not-found" };
  if (response.status === 400) {
    const body = await response.json().catch(() => ({}));
    return { kind: "invalid", problems: Array.isArray(body.problems) ? body.problems : [{ field: "", message: String(body.message ?? "the request is not valid") }] };
  }
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  return { kind: "ok" };
}

export interface ProfileInput {
  label: string;
  parameters: Record<string, unknown>;
  /** Left out to keep the key a profile already has. */
  apiKey?: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function createProviderProfile(password: string, input: ProfileInput & { stage: ProviderStage; adapterType: string }): Promise<ProfileWriteResult> {
  return writeProfile(await adminFetch("/admin/provider-profiles", password, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }));
}

export async function editProviderProfile(password: string, id: string, input: ProfileInput): Promise<ProfileWriteResult> {
  return writeProfile(await adminFetch(`/admin/provider-profiles/${encodeURIComponent(id)}`, password, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(input) }));
}

export async function deleteProviderProfile(password: string, id: string): Promise<ProfileDeleteResult> {
  const response = await adminFetch(`/admin/provider-profiles/${encodeURIComponent(id)}`, password, { method: "DELETE" });
  if (response.status === 401) return { kind: "denied" };
  if (response.status === 404) return { kind: "not-found" };
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    return { kind: "active", stage: body.stage as ProviderStage };
  }
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  return (await response.json()).result === "retired" ? { kind: "retired" } : { kind: "removed" };
}

export type FailedStagesResult = { kind: "ok"; failedStages: FailedStageRow[] } | { kind: "denied" };
export type MoveRefusalReason = "not-found" | "not-failed" | "already-on-active" | "retry-in-progress" | "not-retryable" | "not-usable";
export type MoveStageResult = { kind: "moved" } | { kind: "denied" } | { kind: "refused"; reason: MoveRefusalReason };

/** move-failed-stage-to-active-provider (JOS-172): `GET /admin/failed-stages`. A 401 is `denied`; any other failure rejects. */
export async function getFailedStages(password: string): Promise<FailedStagesResult> {
  const response = await adminFetch("/admin/failed-stages", password);
  if (response.status === 401) return { kind: "denied" };
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  return { kind: "ok", failedStages: (await response.json()).failedStages as FailedStageRow[] };
}

/** `POST /admin/failed-stages/to-active-provider`: moved, a 401 (`denied`), or a refusal with its reason. */
export async function moveFailedStage(password: string, row: Pick<FailedStageRow, "sessionId" | "stage" | "sceneId">): Promise<MoveStageResult> {
  const response = await adminFetch("/admin/failed-stages/to-active-provider", password, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ sessionId: row.sessionId, stage: row.stage, ...(row.sceneId ? { sceneId: row.sceneId } : {}) }),
  });
  if (response.status === 401) return { kind: "denied" };
  if (response.status === 404 || response.status === 409) {
    const body = await response.json().catch(() => ({}));
    return { kind: "refused", reason: (body.reason as MoveRefusalReason) ?? "not-found" };
  }
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  return { kind: "moved" };
}
