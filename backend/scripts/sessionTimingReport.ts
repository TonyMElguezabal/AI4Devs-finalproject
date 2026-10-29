import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

// time-full-size-session (JOS-209) Decisions 1 to 4 — per-stage and per-clip timings of one session, from a copy of the database.
// Usage: node scripts/sessionTimingReport.ts <db-file> <run-id> [settings-file]   (npm run report:session-timing -- ...)

export interface AttemptRow { stage: string; sceneId: string | null; attemptNumber: number; sentAt: string; finishedAt: string | null; outcome: string }
export interface SceneRow { id: string; idx: number; requestedDurationSeconds: number | null }
/** Seconds by attempt stage; `null` or absent: the stage has no limit. */
export type StageLimits = Record<string, number | null>;

export interface StageRow {
  stage: string;
  attempts: number;
  timedOut: number;
  /** First send to last finish, waits between attempts included. */
  elapsedSeconds: number | null;
  slowestSuccessSeconds: number | null;
  limitSeconds: number | null;
  /** `null`: no attempt reached the limit (or the stage has none). */
  margin: number | "not computable" | null;
}
export interface ClipRow { sceneIndex: number; requestedDurationSeconds: number | null; generationSeconds: number | null; attempts: number; outcome: string }
export interface TimingReport { stages: StageRow[]; clips: ClipRow[] }

const STAGES = ["voice-over", "timestamps", "decomposition", "image", "video", "assembly"] as const;
/** The settings file names the limits `maxTimeSeconds.<key>`; the attempts name the stages. */
const SETTINGS_KEY: Record<string, string> = { "voice-over": "voice", timestamps: "alignment" };

const seconds = (attempt: AttemptRow): number | null => (attempt.finishedAt === null ? null : (Date.parse(attempt.finishedAt) - Date.parse(attempt.sentAt)) / 1000);
/** A `late-success` finished after the system gave up, so it says nothing about what the limit allows. */
const successSeconds = (attempts: AttemptRow[]): number[] => attempts.filter((a) => a.outcome === "success").map(seconds).filter((s): s is number => s !== null);

export function buildTimingReport(input: { attempts: AttemptRow[]; scenes: SceneRow[]; limits: StageLimits }): TimingReport {
  const stages = STAGES.map((stage): StageRow => {
    const attempts = input.attempts.filter((a) => a.stage === stage);
    const timedOut = attempts.filter((a) => a.outcome === "timed-out").length;
    const sends = attempts.map((a) => Date.parse(a.sentAt));
    const finishes = attempts.flatMap((a) => (a.finishedAt === null ? [] : [Date.parse(a.finishedAt)]));
    const slowest = Math.max(...successSeconds(attempts), Number.NEGATIVE_INFINITY);
    const slowestSuccessSeconds = Number.isFinite(slowest) ? slowest : null;
    const limitSeconds = input.limits[stage] ?? null;
    return {
      stage,
      attempts: attempts.length,
      timedOut,
      elapsedSeconds: finishes.length === 0 ? null : (Math.max(...finishes) - Math.min(...sends)) / 1000,
      slowestSuccessSeconds,
      limitSeconds,
      margin: timedOut === 0 || limitSeconds === null ? null : slowestSuccessSeconds === null ? "not computable" : limitSeconds / slowestSuccessSeconds,
    };
  });
  const clips = [...input.scenes].sort((a, b) => a.idx - b.idx).map((scene): ClipRow => {
    const attempts = input.attempts.filter((a) => a.stage === "video" && a.sceneId === scene.id).sort((a, b) => a.attemptNumber - b.attemptNumber);
    const success = attempts.find((a) => a.outcome === "success");
    return {
      sceneIndex: scene.idx,
      requestedDurationSeconds: scene.requestedDurationSeconds,
      generationSeconds: success === undefined ? null : seconds(success),
      attempts: attempts.length,
      outcome: success !== undefined ? "success" : (attempts.at(-1)?.outcome ?? "not attempted"),
    };
  });
  return { stages, clips };
}

interface SceneRequest { stage: string; sceneId: string; attemptNumber: number; sentAt: string; latencyMs: number; mode: string }
const SCENE_OUTCOMES: Record<string, string> = { success: "success", not_retryable_failure: "not-retryable" };
/** The release stores no `timed-out` mode for scene stages: a transient failure that lasted the whole limit is one. */
export function sceneRequestToAttempt(request: SceneRequest, limitSeconds: number | null): AttemptRow {
  const timedOut = request.mode === "transient_failure" && limitSeconds !== null && request.latencyMs >= limitSeconds * 1000;
  return {
    stage: request.stage, sceneId: request.sceneId, attemptNumber: request.attemptNumber, sentAt: request.sentAt,
    finishedAt: new Date(Date.parse(request.sentAt) + request.latencyMs).toISOString(),
    outcome: timedOut ? "timed-out" : (SCENE_OUTCOMES[request.mode] ?? "transient"),
  };
}

/** Reads one session from a copy of the database; the file is opened read-only and never written. */
export function loadTimingReport(dbFile: string, runId: string, limits: StageLimits): TimingReport {
  const database = new DatabaseSync(dbFile, { readOnly: true });
  try {
    if (database.prepare("SELECT 1 FROM runs WHERE id = ?").get(runId) === undefined) throw new Error(`no session with id ${runId} in ${dbFile}`);
    // Image and video attempts live in the request log, not in `stage_attempts` (design Decision 7).
    const sessionAttempts = database
      .prepare("SELECT stage, scene_id, attempt_number, sent_at, finished_at, outcome FROM stage_attempts WHERE run_id = ? AND stage NOT IN ('image', 'video')")
      .all(runId)
      .map((row): AttemptRow => ({ stage: String(row.stage), sceneId: row.scene_id === null ? null : String(row.scene_id), attemptNumber: Number(row.attempt_number), sentAt: String(row.sent_at), finishedAt: row.finished_at === null ? null : String(row.finished_at), outcome: String(row.outcome) }));
    const sceneAttempts = database
      .prepare("SELECT p.stage, p.scene_id, p.attempt_number, p.sent_at, p.latency_ms, p.mode FROM provider_requests p JOIN scenes s ON s.id = p.scene_id WHERE s.run_id = ? AND p.stage IN ('image', 'video')")
      .all(runId)
      .map((row) => sceneRequestToAttempt({ stage: String(row.stage), sceneId: String(row.scene_id), attemptNumber: Number(row.attempt_number), sentAt: String(row.sent_at), latencyMs: Number(row.latency_ms), mode: String(row.mode) }, limits[String(row.stage)] ?? null));
    const attempts = [...sessionAttempts, ...sceneAttempts];
    const scenes = database
      .prepare("SELECT id, idx, requested_duration_seconds FROM scenes WHERE run_id = ?")
      .all(runId)
      .map((row): SceneRow => ({ id: String(row.id), idx: Number(row.idx), requestedDurationSeconds: row.requested_duration_seconds === null ? null : Number(row.requested_duration_seconds) }));
    return buildTimingReport({ attempts, scenes, limits });
  } finally {
    database.close();
  }
}

const cell = (value: number | string | null, digits = 0): string => (value === null ? "-" : typeof value === "number" ? value.toFixed(digits) : value);

export function formatMarkdown(report: TimingReport): string {
  const stages = report.stages.map((r) => `| ${r.stage} | ${r.attempts} | ${r.timedOut} | ${cell(r.elapsedSeconds)} | ${cell(r.slowestSuccessSeconds)} | ${cell(r.limitSeconds)} | ${cell(r.margin, 2)} |`);
  const clips = report.clips.map((r) => `| ${r.sceneIndex + 1} | ${cell(r.requestedDurationSeconds)} | ${cell(r.generationSeconds)} | ${r.attempts} | ${r.outcome} |`);
  return [
    "## Stages", "", "| Stage | Attempts | Timed out | Elapsed s | Slowest success s | Limit s | Margin |", "|---|---|---|---|---|---|---|", ...stages,
    "", "Image and video attempts come from the request log; a transient failure lasting the stage limit is counted as timed out.",
    "", "## Clips", "", "| Clip | Requested s | Generation s | Attempts | Outcome |", "|---|---|---|---|---|", ...clips, "",
  ].join("\n");
}

/** Limits by attempt stage from the settings file's `maxTimeSeconds`. */
export function limitsFromSettings(settingsFile: string): StageLimits {
  const { maxTimeSeconds } = JSON.parse(readFileSync(settingsFile, "utf8")) as { maxTimeSeconds: Record<string, number | null> };
  return Object.fromEntries(STAGES.map((stage) => [stage, maxTimeSeconds[SETTINGS_KEY[stage] ?? stage] ?? null]));
}

const entryFile = process.argv[1];
if (entryFile !== undefined && import.meta.url === pathToFileURL(entryFile).href) {
  const [dbFile, runId, settingsFile = join(import.meta.dirname, "..", "config", "settings.default.json")] = process.argv.slice(2);
  if (dbFile === undefined || runId === undefined) {
    console.error("usage: node scripts/sessionTimingReport.ts <db-file> <run-id> [settings-file]");
    process.exit(2);
  }
  try {
    console.log(formatMarkdown(loadTimingReport(dbFile, runId, limitsFromSettings(settingsFile))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
