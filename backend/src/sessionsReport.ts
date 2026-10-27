import { db } from "./db.ts";
import { STUB_PROVIDER_NAME } from "./types.ts";

// report-sessions (JOS-225), design Decisions 2–5 — one row per session created in the period, and the scenes of one session.
// No text column other than the title is read: no script, instruction, prompt, failure cause or error message.

export type SessionFailedPhase = "voice-over" | "decomposition" | "assembly";

export interface SessionRow {
  id: string;
  title: string;
  createdAt: string;
  /** Derived, never stored: a recorded failure wins over a successful assembly, which wins over "in progress". */
  state: "final-video-ready" | "failed" | "in-progress";
  failedPhase: SessionFailedPhase | null;
  paused: boolean;
  scenes: number;
  failedScenes: number;
  attempts: number;
  secondsToVoiceOver: number | null;
  secondsToFinalVideo: number | null;
}

export interface SessionsReport {
  from: string | null;
  to: string;
  rows: SessionRow[];
}

export interface SceneRow {
  number: number;
  status: string;
  imageProvider: string | null;
  clipProvider: string | null;
  imageAttempts: number;
  clipAttempts: number;
  requestedDurationSeconds: number | null;
  speedFactor: number | null;
  durationWarning: string | null;
  speedFactorWarning: string | null;
}

interface SessionDbRow {
  id: string;
  title: string;
  created_at: string;
  paused: number;
  failed_phase: SessionFailedPhase | null;
  assembled: number;
  scenes: number;
  failed_scenes: number;
  attempts: number;
  voice_over_at: string | null;
  assembled_at: string | null;
}

/** Seconds from `from` to `to`, to one decimal; `null` when either instant is missing. */
function secondsBetween(from: string, to: string | null): number | null {
  return to === null ? null : Math.round((Date.parse(to) - Date.parse(from)) / 100) / 10;
}

// ponytail: lists every session of the period in one query; add pagination if the list gets long.
/** The sessions created in `[from, to)` (`from` absent: from the first session), newest first. */
export function sessionsReport(period: { from?: string; to: string }): SessionsReport {
  const from = period.from ?? null;
  const rows = db
    .prepare(
      `SELECT r.id, r.title, r.created_at, r.paused,
              json_extract(r.failure, '$.phase') AS failed_phase,
              EXISTS (SELECT 1 FROM stage_attempts a WHERE a.run_id = r.id AND a.stage = 'assembly' AND a.outcome = 'success') AS assembled,
              (SELECT COUNT(*) FROM scenes s WHERE s.run_id = r.id) AS scenes,
              (SELECT COUNT(*) FROM scenes s WHERE s.run_id = r.id AND s.status = 'failed') AS failed_scenes,
              (SELECT COUNT(*) FROM stage_attempts a WHERE a.run_id = r.id AND a.stage IN ('voice-over', 'timestamps', 'decomposition') AND a.sent_at IS NOT NULL)
                + (SELECT COUNT(*) FROM provider_requests pr JOIN scenes s ON s.id = pr.scene_id WHERE s.run_id = r.id) AS attempts,
              (SELECT v.completed_at FROM voice_overs v WHERE v.run_id = r.id) AS voice_over_at,
              (SELECT MAX(a.finished_at) FROM stage_attempts a WHERE a.run_id = r.id AND a.stage = 'assembly' AND a.outcome = 'success') AS assembled_at
       FROM runs r
       WHERE (? IS NULL OR r.created_at >= ?) AND r.created_at < ?
       ORDER BY r.created_at DESC, r.id DESC`,
    )
    .all(from, from, period.to) as unknown as SessionDbRow[];

  return {
    from,
    to: period.to,
    rows: rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      state: row.failed_phase ? "failed" : row.assembled ? "final-video-ready" : "in-progress",
      failedPhase: row.failed_phase,
      paused: row.paused === 1,
      scenes: row.scenes,
      failedScenes: row.failed_scenes,
      attempts: row.attempts,
      secondsToVoiceOver: secondsBetween(row.created_at, row.voice_over_at),
      secondsToFinalVideo: secondsBetween(row.created_at, row.assembled_at),
    })),
  };
}

interface SceneDbRow {
  idx: number;
  status: string;
  provider: string;
  video_provider: string | null;
  requested_duration_seconds: number | null;
  speed_factor: number | null;
  duration_warning: string | null;
  speed_factor_warning: string | null;
  image_attempts: number;
  clip_attempts: number;
}

/** The scenes of one session in scene order, or `null` when the session does not exist. */
export function sessionScenesReport(sessionId: string): { sessionId: string; rows: SceneRow[] } | null {
  if (!db.prepare("SELECT 1 FROM runs WHERE id = ?").get(sessionId)) return null;
  const labels = new Map((db.prepare("SELECT id, label FROM provider_profiles").all() as unknown as { id: string; label: string }[]).map((row) => [row.id, row.label]));
  const labelOf = (id: string | null) => (id === null || id === STUB_PROVIDER_NAME ? null : (labels.get(id) ?? id));
  const rows = db
    .prepare(
      `SELECT s.idx, s.status, s.provider, s.video_provider, s.requested_duration_seconds, s.speed_factor, s.duration_warning, s.speed_factor_warning,
              (SELECT COUNT(*) FROM provider_requests pr WHERE pr.scene_id = s.id AND pr.stage = 'image') AS image_attempts,
              (SELECT COUNT(*) FROM provider_requests pr WHERE pr.scene_id = s.id AND pr.stage = 'video') AS clip_attempts
       FROM scenes s WHERE s.run_id = ? ORDER BY s.idx`,
    )
    .all(sessionId) as unknown as SceneDbRow[];
  return {
    sessionId,
    rows: rows.map((row) => ({
      number: row.idx,
      status: row.status,
      imageProvider: labelOf(row.provider),
      clipProvider: labelOf(row.video_provider),
      imageAttempts: row.image_attempts,
      clipAttempts: row.clip_attempts,
      requestedDurationSeconds: row.requested_duration_seconds,
      speedFactor: row.speed_factor,
      durationWarning: row.duration_warning,
      speedFactorWarning: row.speed_factor_warning,
    })),
  };
}
