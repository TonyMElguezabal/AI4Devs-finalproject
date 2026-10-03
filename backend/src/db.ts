// Uses Node's built-in `node:sqlite` (stable enough as of Node 22.5+, no
// native compilation) rather than `better-sqlite3`: the latter's native
// addon failed to build against this Node version's V8 headers during this
// spike (see ../design.md § Candidate Evaluation / the ADR) — a concrete,
// evidence-based reason to prefer the zero-native-dependency option.
//
// `define-persistence` (JOS-181) independently evaluated embedded DB vs.
// server DB vs. structured files and confirmed this on the merits
// (`openspec/changes/define-persistence/design.md` § Execution Record §3) —
// this is no longer a disposable stand-in, it is the decision.
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, linkSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type {
  AttemptStage,
  DurationWarning,
  NarrationInterval,
  ProviderOutcomeMode,
  ProviderRequestRow,
  Run,
  Scene,
  SceneState,
  SpeedFactorWarning,
  StageAttempt,
  StageAttemptOutcome,
  VoiceOver,
  SessionFailure,
  NarrationTimestamps,
  NarrationTimestampsInput,
  VoiceOverInput,
} from "./types.ts";
import { STUB_PROVIDER_NAME } from "./types.ts";

export type { NarrationTimestampsInput, VoiceOverInput } from "./types.ts";

const DB_PATH = process.env.DB_PATH ?? "data/skeleton.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

/** PRD §12.2 — local per-project folders, never deleted, never expiring. */
export const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "data/projects";
mkdirSync(PROJECTS_ROOT, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// ---- Baseline schema (version 1) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    paused INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    idx INTEGER NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    current_request_id TEXT,
    last_error TEXT,
    result TEXT,
    instruction TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '${STUB_PROVIDER_NAME}',
    provider_mode TEXT NOT NULL DEFAULT 'success',
    provider_latency_ms INTEGER NOT NULL DEFAULT 200,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS provider_requests (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id),
    sent_at TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    mode TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
  );

  -- Decision 3 / spec: "Uniqueness SHALL be enforced by the store itself
  -- rather than by a prior read in application code." A repeated success
  -- confirmation for the same scene is a second INSERT here, which the
  -- PRIMARY KEY rejects — the guarantee is real regardless of what the
  -- application code checked first.
  CREATE TABLE IF NOT EXISTS scene_results (
    scene_id TEXT PRIMARY KEY REFERENCES scenes(id),
    result TEXT NOT NULL,
    committed_at TEXT NOT NULL
  );
`);

// ---- Content locks (lock-script-and-narration, JOS-137, PRD §4.2 / D10) ----
// The rule lives in the store, so it applies to every caller, present or
// future — not only to the repository functions below. One trigger per
// column so each refusal names the field that was touched (SQLite cannot
// build a message dynamically). `UPDATE OF <column>` fires whenever that
// column appears in a SET list, even for an identical value: nothing
// legitimate writes these columns after the INSERT.
const LOCKED_SESSION_COLUMNS = ["title", "script", "language"] as const;

function lockedSessionColumnTriggerDdl(column: (typeof LOCKED_SESSION_COLUMNS)[number]): string {
  return `CREATE TRIGGER runs_${column}_locked BEFORE UPDATE OF ${column} ON runs
    BEGIN
      SELECT RAISE(ABORT, 'locked: runs.${column} cannot be modified after registration');
    END;`;
}

export const SESSION_CONTENT_LOCK_TRIGGERS_DDL: readonly string[] = LOCKED_SESSION_COLUMNS.map(lockedSessionColumnTriggerDdl);

// A completed narration is never replaced (AC2, design Decision 2): the
// record cannot be modified or deleted once written, and the primary key
// already refuses a second one. Only `resetAll()` (test-only) lifts the
// delete trigger, inside one transaction, and recreates it from this same
// constant so the two cannot drift.
export const VOICE_OVER_NO_UPDATE_TRIGGER_DDL = `CREATE TRIGGER voice_overs_no_update BEFORE UPDATE ON voice_overs
  BEGIN
    SELECT RAISE(ABORT, 'locked: voice_overs cannot be modified once the narration is complete');
  END;`;

export const VOICE_OVER_NO_DELETE_TRIGGER_DDL = `CREATE TRIGGER voice_overs_no_delete BEFORE DELETE ON voice_overs
  BEGIN
    SELECT RAISE(ABORT, 'locked: voice_overs cannot be deleted once the narration is complete');
  END;`;

// assign-scene-identifiers (JOS-144) Decision 7 — an established chunk is never
// split, merged, deleted or reordered (PRD §6): its number, its PROMPT and its
// session cannot change, and it cannot be deleted. IMAGE and VIDEO stay
// writable, since §10.3 lets them be corrected after a failed stage.
const LOCKED_SCENE_COLUMNS = ["idx", "prompt", "run_id"] as const;

export const SCENE_LOCK_TRIGGERS_DDL: readonly string[] = LOCKED_SCENE_COLUMNS.map(
  (column) => `CREATE TRIGGER scenes_${column}_locked BEFORE UPDATE OF ${column} ON scenes
    BEGIN
      SELECT RAISE(ABORT, 'locked: scenes.${column} cannot be modified once the chunk is established');
    END;`,
);

export const SCENE_NO_DELETE_TRIGGER_DDL = `CREATE TRIGGER scenes_no_delete BEFORE DELETE ON scenes
  BEGIN
    SELECT RAISE(ABORT, 'locked: scenes cannot be deleted once the chunk is established');
  END;`;

// assign-narration-intervals (JOS-143) Decision 3 — a chunk's narration interval
// is never edited (PRD §3 "No permitida", AC4), not even by processing or
// retries, which run inside the backend and so are stopped here, below the
// application code. A constant of its own, not an addition to
// LOCKED_SCENE_COLUMNS: migration 7 builds its triggers from that array, and
// an applied migration's behaviour is never edited.
const LOCKED_SCENE_INTERVAL_COLUMNS = ["narration_start_seconds", "narration_end_seconds"] as const;

export const SCENE_INTERVAL_LOCK_TRIGGERS_DDL: readonly string[] = LOCKED_SCENE_INTERVAL_COLUMNS.map(
  (column) => `CREATE TRIGGER scenes_${column}_locked BEFORE UPDATE OF ${column} ON scenes
    BEGIN
      SELECT RAISE(ABORT, 'locked: scenes.${column} cannot be modified once the chunk is established');
    END;`,
);

// request-admitted-clip-duration (JOS-147) Decision 3 — the requested duration
// and its over-maximum warning are decided once at registration (from the
// interval above) and never change afterwards, for the same reason the
// interval itself is locked: a later build with different admitted durations
// must not alter what an established chunk already asked for. A constant of
// its own, not an addition to LOCKED_SCENE_INTERVAL_COLUMNS, for the same
// reason that one is not an addition to LOCKED_SCENE_COLUMNS.
const LOCKED_SCENE_DURATION_REQUEST_COLUMNS = ["requested_duration_seconds", "duration_warning"] as const;

export const SCENE_DURATION_REQUEST_LOCK_TRIGGERS_DDL: readonly string[] = LOCKED_SCENE_DURATION_REQUEST_COLUMNS.map(
  (column) => `CREATE TRIGGER scenes_${column}_locked BEFORE UPDATE OF ${column} ON scenes
    BEGIN
      SELECT RAISE(ABORT, 'locked: scenes.${column} cannot be modified once the chunk is established');
    END;`,
);

// record-speed-adjustment-factor (JOS-148) Decision 2 — the speed-adjustment
// factor and its limit warning are decided once at registration (from the
// requested duration and interval above) and never change afterwards, for
// the same reason the requested duration itself is locked: a later build
// with a different `SPEED_FACTOR_LIMIT` must not reinterpret an already-
// established chunk. A constant of its own for the same reason the
// requested-duration columns are not folded into the interval's.
const LOCKED_SCENE_SPEED_FACTOR_COLUMNS = ["speed_factor", "speed_factor_warning"] as const;

export const SCENE_SPEED_FACTOR_LOCK_TRIGGERS_DDL: readonly string[] = LOCKED_SCENE_SPEED_FACTOR_COLUMNS.map(
  (column) => `CREATE TRIGGER scenes_${column}_locked BEFORE UPDATE OF ${column} ON scenes
    BEGIN
      SELECT RAISE(ABORT, 'locked: scenes.${column} cannot be modified once the chunk is established');
    END;`,
);

// obtain-narration-timestamps (JOS-139) Decision 7 — the obtained timestamps are
// stored once and never replaced (PRD §10.3: segmentation and every retry use
// the same ones). `resetAll()` (test-only) lifts the delete trigger inside its
// transaction and recreates it from this same constant.
export const NARRATION_TIMESTAMPS_NO_UPDATE_TRIGGER_DDL = `CREATE TRIGGER narration_timestamps_no_update BEFORE UPDATE ON narration_timestamps
  BEGIN
    SELECT RAISE(ABORT, 'locked: narration_timestamps cannot be modified once obtained');
  END;`;

export const NARRATION_TIMESTAMPS_NO_DELETE_TRIGGER_DDL = `CREATE TRIGGER narration_timestamps_no_delete BEFORE DELETE ON narration_timestamps
  BEGIN
    SELECT RAISE(ABORT, 'locked: narration_timestamps cannot be deleted once obtained');
  END;`;

// ---- Versioned migrations (Decision 6) — applied on top of the baseline ----
// Each migration takes the target database explicitly (not a closed-over
// singleton) so the exact same runner can be pointed at a fixture database
// in tests to prove experiment 5.7 (an existing session survives an upgrade)
// without depending on process-wide module state.
const MIGRATIONS: Array<{ version: number; description: string; up: (target: DatabaseSync) => void }> = [
  {
    version: 2,
    description: "add runs.language and runs.project_folder",
    up: (target) => {
      target.exec("ALTER TABLE runs ADD COLUMN language TEXT NOT NULL DEFAULT ''");
      target.exec("ALTER TABLE runs ADD COLUMN project_folder TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    version: 3,
    description: "add runs.script (start-video-project, JOS-134, PRD §4.2/D10 write-once field)",
    up: (target) => {
      target.exec("ALTER TABLE runs ADD COLUMN script TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    version: 4,
    description: "add the voice-over records (generate-voice-over, JOS-136): runs.voice_provider_id, runs.failure, voice_overs, stage_attempts",
    up: (target) => {
      target.exec("ALTER TABLE runs ADD COLUMN voice_provider_id TEXT");
      target.exec("ALTER TABLE runs ADD COLUMN failure TEXT");
      // Decision 8 — one voice-over per session is the PRIMARY KEY, not a prior read.
      target.exec(`
        CREATE TABLE voice_overs (
          run_id TEXT PRIMARY KEY REFERENCES runs(id),
          audio_path TEXT NOT NULL,
          timestamps_path TEXT,
          duration_seconds REAL NOT NULL,
          size_bytes INTEGER NOT NULL,
          native_timestamps_available INTEGER NOT NULL,
          provider_request_id TEXT,
          completed_at TEXT NOT NULL
        );
      `);
      // Decision 2 — written before the request is sent; only its outcome
      // columns are ever filled in afterwards.
      target.exec(`
        CREATE TABLE stage_attempts (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(id),
          stage TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          attempt_number INTEGER NOT NULL,
          queued_at TEXT NOT NULL,
          sent_at TEXT NOT NULL,
          outcome TEXT NOT NULL CHECK (outcome IN ('in-flight', 'success', 'transient', 'not-retryable')),
          finished_at TEXT,
          external_request_id TEXT,
          error_code TEXT,
          error_message TEXT,
          UNIQUE (run_id, stage, attempt_number)
        );
      `);
    },
  },
  {
    version: 5,
    description: "lock the session's title, script and language (lock-script-and-narration, JOS-137)",
    up: (target) => {
      for (const ddl of SESSION_CONTENT_LOCK_TRIGGERS_DDL) target.exec(ddl);
    },
  },
  {
    version: 6,
    description: "lock a completed voice-over record against update and delete (lock-script-and-narration, JOS-137)",
    up: (target) => {
      target.exec(VOICE_OVER_NO_UPDATE_TRIGGER_DDL);
      target.exec(VOICE_OVER_NO_DELETE_TRIGGER_DDL);
    },
  },
  {
    version: 7,
    description:
      "add the chunk content columns, a per-session unique chunk number and the chunk locks (assign-scene-identifiers, JOS-144)",
    up: (target) => {
      target.exec("ALTER TABLE scenes ADD COLUMN prompt TEXT NOT NULL DEFAULT ''");
      target.exec("ALTER TABLE scenes ADD COLUMN image_instruction TEXT NOT NULL DEFAULT ''");
      target.exec("ALTER TABLE scenes ADD COLUMN video_instruction TEXT NOT NULL DEFAULT ''");
      // Decision 2 — the PRD's ID is `idx`, unique within its session only.
      target.exec("CREATE UNIQUE INDEX scenes_run_id_idx_unique ON scenes (run_id, idx)");
      for (const ddl of SCENE_LOCK_TRIGGERS_DDL) target.exec(ddl);
      target.exec(SCENE_NO_DELETE_TRIGGER_DDL);
    },
  },
  {
    version: 8,
    description: "add narration_timestamps, stored once and locked (obtain-narration-timestamps, JOS-139)",
    up: (target) => {
      // One record per session is the PRIMARY KEY, not a prior read.
      target.exec(`
        CREATE TABLE narration_timestamps (
          run_id TEXT PRIMARY KEY REFERENCES runs(id),
          mechanism TEXT NOT NULL CHECK (mechanism IN ('native', 'alignment')),
          path TEXT NOT NULL,
          character_count INTEGER NOT NULL,
          obtained_at TEXT NOT NULL
        );
      `);
      target.exec(NARRATION_TIMESTAMPS_NO_UPDATE_TRIGGER_DDL);
      target.exec(NARRATION_TIMESTAMPS_NO_DELETE_TRIGGER_DDL);
    },
  },
  {
    version: 9,
    description: "add the chunk narration interval columns and their locks (assign-narration-intervals, JOS-143)",
    up: (target) => {
      // Nullable: scenes created by the pre-decomposition skeleton path have no interval, and a default would be a fake one.
      target.exec("ALTER TABLE scenes ADD COLUMN narration_start_seconds REAL");
      target.exec("ALTER TABLE scenes ADD COLUMN narration_end_seconds REAL");
      for (const ddl of SCENE_INTERVAL_LOCK_TRIGGERS_DDL) target.exec(ddl);
    },
  },
  {
    version: 10,
    description: "add the requested clip duration and its warning, and lock them (request-admitted-clip-duration, JOS-147)",
    up: (target) => {
      // INTEGER: every admitted duration is a whole number of seconds (VIDEO_ADMITTED_DURATIONS_SECONDS).
      // Nullable: a scene created by the pre-decomposition skeleton path has no interval, hence no request.
      target.exec("ALTER TABLE scenes ADD COLUMN requested_duration_seconds INTEGER");
      target.exec("ALTER TABLE scenes ADD COLUMN duration_warning TEXT");
      for (const ddl of SCENE_DURATION_REQUEST_LOCK_TRIGGERS_DDL) target.exec(ddl);
    },
  },
  {
    version: 11,
    description: "add the speed-adjustment factor and its limit warning, and lock them (record-speed-adjustment-factor, JOS-148)",
    up: (target) => {
      // REAL: the factor is a ratio, not a whole number.
      // Nullable: a scene created by the pre-decomposition skeleton path has no requested duration, hence no factor.
      target.exec("ALTER TABLE scenes ADD COLUMN speed_factor REAL");
      target.exec("ALTER TABLE scenes ADD COLUMN speed_factor_warning TEXT");
      for (const ddl of SCENE_SPEED_FACTOR_LOCK_TRIGGERS_DDL) target.exec(ddl);
    },
  },
];

export function applyMigrationsTo(target: DatabaseSync): number[] {
  target.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (target.prepare("SELECT version FROM schema_migrations").all() as any[]).map((r) => r.version),
  );
  const justApplied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    migration.up(target);
    target.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      migration.version,
      new Date().toISOString(),
    );
    justApplied.push(migration.version);
  }
  return justApplied;
}

export const migrationsAppliedOnBoot = applyMigrationsTo(db);

function nowIso(): string {
  return new Date().toISOString();
}

// ---- PRD §12.2 project-folder naming: "<title> <YYYY-MM-DD HH-mm>", counter on collision ----

function sanitizeForFilesystem(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_").trim() || "untitled";
}

function formatFolderTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

/** Derives the folder name and creates the real directory on disk. Exported
 * separately from `createRun` so experiments can call it directly. */
export function deriveAndCreateProjectFolder(title: string, createdAt: Date): string {
  const base = `${sanitizeForFilesystem(title)} ${formatFolderTimestamp(createdAt)}`;
  let candidate = base;
  let counter = 2;
  while (existsSync(join(PROJECTS_ROOT, candidate))) {
    candidate = `${base} (${counter})`;
    counter++;
  }
  mkdirSync(join(PROJECTS_ROOT, candidate), { recursive: true });
  return candidate;
}

/**
 * consult-session (JOS-135) Decision 2 — "make cross-session leakage
 * structurally impossible rather than guarded by convention." A relative
 * path containing `..` segments could otherwise resolve outside the
 * session's own folder (into another session's folder, or anywhere else on
 * disk); this is checked here, once, rather than trusted at every caller.
 */
function assertWithinProjectFolder(projectFolder: string, relativePath: string): string {
  const folderRoot = resolve(PROJECTS_ROOT, projectFolder);
  const fullPath = resolve(folderRoot, relativePath);
  if (fullPath !== folderRoot && !fullPath.startsWith(folderRoot + sep)) {
    throw new Error(`refused: '${relativePath}' resolves outside its session's project folder`);
  }
  return fullPath;
}

/** Decision 4 — artefacts are written relative to the session's recorded
 * folder. Returns the relative path stored on the scene record. */
export function writeArtefact(projectFolder: string, relativePath: string, content: string): string {
  const fullPath = assertWithinProjectFolder(projectFolder, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
  return relativePath;
}

// The field is declared explicitly, not as a constructor parameter property:
// the server runs as `node src/server.ts` (strip-only mode), which refuses
// TypeScript syntax that emits code. `erasableSyntaxOnly` enforces this.
export class ArtefactAlreadyExistsError extends Error {
  readonly relativePath: string;

  constructor(relativePath: string) {
    super(`refused: '${relativePath}' already exists and is written once`);
    this.name = "ArtefactAlreadyExistsError";
    this.relativePath = relativePath;
  }
}

/**
 * lock-script-and-narration (JOS-137) Decision 3 — writes an artefact that
 * must never be replaced (the voice-over MP3). The content goes to a
 * temporary name beside the target and is then hard-linked to the final
 * name: `link` is atomic and fails with EEXIST when the target exists,
 * whereas `rename` would silently replace it, and an `existsSync` check
 * before writing would be a read-then-write race. The temporary name is
 * always removed. Scoped to the session's project folder exactly like
 * `writeArtefact`. Returns the relative path stored on the record.
 */
export function writeArtefactOnce(projectFolder: string, relativePath: string, content: Buffer | string): string {
  const fullPath = assertWithinProjectFolder(projectFolder, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  const temporaryPath = `${fullPath}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, content, { flag: "wx" });
  try {
    linkSync(temporaryPath, fullPath);
  } catch (err: any) {
    throw err?.code === "EEXIST" ? new ArtefactAlreadyExistsError(relativePath) : err;
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return relativePath;
}

export function resolveArtefactPath(projectFolder: string, relativePath: string): string {
  return assertWithinProjectFolder(projectFolder, relativePath);
}

export function createRun(id: string, title: string, script: string, language: string): Run {
  const createdAt = nowIso();
  const projectFolder = deriveAndCreateProjectFolder(title, new Date(createdAt));
  db.prepare(
    "INSERT INTO runs (id, title, created_at, paused, language, project_folder, script) VALUES (?, ?, ?, 0, ?, ?, ?)",
  ).run(id, title, createdAt, language, projectFolder, script);
  return { id, title, script, createdAt, paused: false, language, projectFolder, voiceProviderId: null, failure: null };
}

export function setRunProjectFolder(runId: string, projectFolder: string): void {
  db.prepare("UPDATE runs SET project_folder = ? WHERE id = ?").run(projectFolder, runId);
}

export function createScene(
  id: string,
  runId: string,
  index: number,
  providerMode: ProviderOutcomeMode,
  providerLatencyMs: number,
  instruction = "",
): Scene {
  const updatedAt = nowIso();
  db.prepare(
    "INSERT INTO scenes (id, run_id, idx, status, attempts, instruction, provider_mode, provider_latency_ms, updated_at) VALUES (?, ?, ?, 'submitted', 0, ?, ?, ?, ?)",
  ).run(id, runId, index, instruction, providerMode, providerLatencyMs, updatedAt);
  return {
    id,
    runId,
    index,
    status: "submitted",
    attempts: 0,
    lastError: null,
    result: null,
    instruction,
    prompt: "",
    imageInstruction: "",
    videoInstruction: "",
    narrationInterval: null,
    requestedDurationSeconds: null,
    durationWarning: null,
    speedFactor: null,
    speedFactorWarning: null,
    provider: STUB_PROVIDER_NAME,
    providerMode,
    providerLatencyMs,
    updatedAt,
  };
}

function rowToScene(row: any): Scene {
  return {
    id: row.id,
    runId: row.run_id,
    index: row.idx,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    result: row.result,
    instruction: row.instruction,
    // NOT NULL DEFAULT '' since migration 7, so no fallback is needed.
    prompt: row.prompt,
    imageInstruction: row.image_instruction,
    videoInstruction: row.video_instruction,
    narrationInterval:
      row.narration_start_seconds === null || row.narration_end_seconds === null
        ? null
        : { startSeconds: row.narration_start_seconds, endSeconds: row.narration_end_seconds },
    requestedDurationSeconds: row.requested_duration_seconds,
    durationWarning: row.duration_warning,
    speedFactor: row.speed_factor,
    speedFactorWarning: row.speed_factor_warning,
    provider: row.provider,
    providerMode: row.provider_mode,
    providerLatencyMs: row.provider_latency_ms,
    updatedAt: row.updated_at,
  };
}

function rowToRun(row: any): Run {
  return {
    id: row.id,
    title: row.title,
    script: row.script ?? "",
    createdAt: row.created_at,
    paused: Boolean(row.paused),
    language: row.language ?? "",
    projectFolder: row.project_folder ?? "",
    voiceProviderId: row.voice_provider_id ?? null,
    failure: row.failure ? (JSON.parse(row.failure) as SessionFailure) : null,
  };
}

/** assign-scene-identifiers (JOS-144) — a chunk as registration writes it. */
export interface RegisteredSceneInput {
  id: string;
  /** The PRD's ID, 1..N. */
  index: number;
  prompt: string;
  imageInstruction: string;
  videoInstruction: string;
  /** assign-narration-intervals (JOS-143): written once here, locked afterwards. */
  narrationInterval: NarrationInterval;
  /** request-admitted-clip-duration (JOS-147): written once here, locked afterwards. */
  requestedDurationSeconds: number;
  durationWarning: DurationWarning | null;
  /** record-speed-adjustment-factor (JOS-148): written once here, locked afterwards. */
  speedFactor: number;
  speedFactorWarning: SpeedFactorWarning | null;
}

export function countScenesForRun(runId: string): number {
  return (db.prepare("SELECT COUNT(*) c FROM scenes WHERE run_id = ?").get(runId) as { c: number }).c;
}

/**
 * assign-scene-identifiers (JOS-144) Decision 5 — registers every chunk of a
 * decomposition in ONE transaction, and clears an earlier session failure in
 * the same transaction: either all chunks exist afterwards, or none do. The
 * unique (run_id, idx) index refuses a second registration even if two
 * callers race; the caller maps that to "already registered".
 */
export function insertRegisteredScenes(runId: string, scenes: readonly RegisteredSceneInput[]): void {
  const updatedAt = nowIso();
  const insert = db.prepare(
    "INSERT INTO scenes (id, run_id, idx, status, attempts, instruction, prompt, image_instruction, video_instruction, narration_start_seconds, narration_end_seconds, requested_duration_seconds, duration_warning, speed_factor, speed_factor_warning, updated_at) VALUES (?, ?, ?, 'submitted', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    for (const scene of scenes) {
      // Decision 3 — the skeleton image stage still reads `instruction`.
      insert.run(
        scene.id,
        runId,
        scene.index,
        scene.imageInstruction,
        scene.prompt,
        scene.imageInstruction,
        scene.videoInstruction,
        scene.narrationInterval.startSeconds,
        scene.narrationInterval.endSeconds,
        scene.requestedDurationSeconds,
        scene.durationWarning,
        scene.speedFactor,
        scene.speedFactorWarning,
        updatedAt,
      );
    }
    db.prepare("UPDATE runs SET failure = NULL WHERE id = ?").run(runId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getScene(id: string): Scene | undefined {
  const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as any;
  return row ? rowToScene(row) : undefined;
}

/**
 * consult-session (JOS-135) Decision 2 — the scoped lookup: a scene id from
 * a different session does not resolve, even though scene ids happen to be
 * globally unique in this schema. Callers that read a scene *on behalf of*
 * a specific session (as opposed to internal orchestration code that
 * already holds a scene by its own id) should prefer this over `getScene`.
 */
export function getSceneForRun(runId: string, sceneId: string): Scene | undefined {
  const row = db.prepare("SELECT * FROM scenes WHERE id = ? AND run_id = ?").get(sceneId, runId) as any;
  return row ? rowToScene(row) : undefined;
}

export function getScenesForRun(runId: string): Scene[] {
  const rows = db.prepare("SELECT * FROM scenes WHERE run_id = ? ORDER BY idx ASC").all(runId) as any[];
  return rows.map(rowToScene);
}

export function getRun(id: string): Run | undefined {
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as any;
  return row ? rowToRun(row) : undefined;
}

export function setRunPaused(runId: string, paused: boolean): void {
  db.prepare("UPDATE runs SET paused = ? WHERE id = ?").run(paused ? 1 : 0, runId);
}

/**
 * generate-voice-over (JOS-136) Decision 3 — binds the voice provider on the
 * first attempt only (PRD §11.2). Returns `true` only for the call that
 * actually binds; once set, the value is never overwritten, so a later build
 * with a different hardcoded provider cannot silently switch a session.
 */
export function bindVoiceProvider(runId: string, providerId: string): boolean {
  const result = db
    .prepare("UPDATE runs SET voice_provider_id = ? WHERE id = ? AND voice_provider_id IS NULL")
    .run(providerId, runId);
  return Number(result.changes) > 0;
}

/** Clears the session's failure once the phase that failed has succeeded (a retry that worked). A no-op when there is none. */
export function clearRunFailure(runId: string): void {
  db.prepare("UPDATE runs SET failure = NULL WHERE id = ?").run(runId);
}

/** Decision 9 — the session's failure, so a failure with no attempt behind it (a missing credential) is still reported. */
export function setRunFailure(runId: string, failure: SessionFailure): void {
  db.prepare("UPDATE runs SET failure = ? WHERE id = ?").run(JSON.stringify(failure), runId);
}

function rowToVoiceOver(row: any): VoiceOver {
  return {
    runId: row.run_id,
    audioPath: row.audio_path,
    timestampsPath: row.timestamps_path ?? null,
    durationSeconds: row.duration_seconds,
    sizeBytes: row.size_bytes,
    nativeTimestampsAvailable: Boolean(row.native_timestamps_available),
    providerRequestId: row.provider_request_id ?? null,
    completedAt: row.completed_at,
  };
}

/**
 * Decision 8 — the store-level guarantee of one voice-over per session.
 * Returns `true` only for the call that genuinely stores it; a repeated or
 * concurrent confirmation hits the `voice_overs` PRIMARY KEY and returns
 * `false`, whatever any earlier read said.
 */
export function insertVoiceOver(input: VoiceOverInput): boolean {
  try {
    db.prepare(
      "INSERT INTO voice_overs (run_id, audio_path, timestamps_path, duration_seconds, size_bytes, native_timestamps_available, provider_request_id, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      input.runId,
      input.audioPath,
      input.timestampsPath,
      input.durationSeconds,
      input.sizeBytes,
      input.nativeTimestampsAvailable ? 1 : 0,
      input.providerRequestId,
      input.completedAt,
    );
    return true;
  } catch (err: any) {
    if (err?.code === "ERR_SQLITE_ERROR" && /UNIQUE constraint failed/i.test(String(err.message))) {
      return false;
    }
    throw err; // any other constraint failure (for example an unknown session) is a real bug
  }
}

export function getVoiceOver(runId: string): VoiceOver | undefined {
  const row = db.prepare("SELECT * FROM voice_overs WHERE run_id = ?").get(runId) as any;
  return row ? rowToVoiceOver(row) : undefined;
}

export function countVoiceOvers(runId: string): number {
  const row = db.prepare("SELECT COUNT(*) c FROM voice_overs WHERE run_id = ?").get(runId) as any;
  return row.c as number;
}

function rowToNarrationTimestamps(row: any): NarrationTimestamps {
  return {
    runId: row.run_id,
    mechanism: row.mechanism,
    path: row.path,
    characterCount: row.character_count,
    obtainedAt: row.obtained_at,
  };
}

/**
 * obtain-narration-timestamps (JOS-139) Decision 7 — stores the session's
 * timestamps once. Returns `true` only for the call that stores them; a second
 * one hits the PRIMARY KEY and returns `false`, whatever any earlier read said.
 */
export function insertNarrationTimestamps(input: NarrationTimestampsInput): boolean {
  try {
    db.prepare(
      "INSERT INTO narration_timestamps (run_id, mechanism, path, character_count, obtained_at) VALUES (?, ?, ?, ?, ?)",
    ).run(input.runId, input.mechanism, input.path, input.characterCount, input.obtainedAt);
    return true;
  } catch (err: any) {
    if (err?.code === "ERR_SQLITE_ERROR" && /UNIQUE constraint failed/i.test(String(err.message))) return false;
    throw err;
  }
}

export function getNarrationTimestamps(runId: string): NarrationTimestamps | undefined {
  const row = db.prepare("SELECT * FROM narration_timestamps WHERE run_id = ?").get(runId) as any;
  return row ? rowToNarrationTimestamps(row) : undefined;
}

export function countNarrationTimestamps(runId: string): number {
  return (db.prepare("SELECT COUNT(*) c FROM narration_timestamps WHERE run_id = ?").get(runId) as { c: number }).c;
}

function rowToStageAttempt(row: any): StageAttempt {
  return {
    id: row.id,
    runId: row.run_id,
    stage: row.stage,
    providerId: row.provider_id,
    attemptNumber: row.attempt_number,
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
    outcome: row.outcome,
    finishedAt: row.finished_at ?? null,
    externalRequestId: row.external_request_id ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
  };
}

/**
 * Decision 2 — records an attempt as `in-flight` BEFORE the request is sent,
 * so a crash between send and response still leaves a trace. The sequence is
 * computed inside the INSERT itself (one statement), not read first, so two
 * racing attempts cannot both take the same number; the unique key would
 * reject the second regardless.
 */
export function recordStageAttempt(input: {
  runId: string;
  stage: AttemptStage;
  providerId: string;
  queuedAt: string;
  sentAt: string;
}): StageAttempt {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO stage_attempts (id, run_id, stage, provider_id, attempt_number, queued_at, sent_at, outcome)
     SELECT ?, ?, ?, ?, COALESCE(MAX(attempt_number), 0) + 1, ?, ?, 'in-flight'
     FROM stage_attempts WHERE run_id = ? AND stage = ?`,
  ).run(id, input.runId, input.stage, input.providerId, input.queuedAt, input.sentAt, input.runId, input.stage);
  return rowToStageAttempt(db.prepare("SELECT * FROM stage_attempts WHERE id = ?").get(id));
}

/**
 * Fills in an in-flight attempt's outcome. Returns `false` when the attempt
 * was already completed, so a repeated outcome cannot rewrite history.
 */
export function completeStageAttempt(
  attemptId: string,
  outcome: {
    outcome: Exclude<StageAttemptOutcome, "in-flight">;
    finishedAt: string;
    externalRequestId?: string;
    errorCode?: string;
    errorMessage?: string;
  },
): boolean {
  if ((outcome.outcome as StageAttemptOutcome) === "in-flight") {
    throw new Error("cannot complete an attempt with the in-flight outcome");
  }
  const result = db
    .prepare(
      "UPDATE stage_attempts SET outcome = ?, finished_at = ?, external_request_id = ?, error_code = ?, error_message = ? WHERE id = ? AND outcome = 'in-flight'",
    )
    .run(
      outcome.outcome,
      outcome.finishedAt,
      outcome.externalRequestId ?? null,
      outcome.errorCode ?? null,
      outcome.errorMessage ?? null,
      attemptId,
    );
  return Number(result.changes) > 0;
}

export function getStageAttempts(runId: string, stage: AttemptStage): StageAttempt[] {
  const rows = db
    .prepare("SELECT * FROM stage_attempts WHERE run_id = ? AND stage = ? ORDER BY attempt_number ASC")
    .all(runId, stage) as any[];
  return rows.map(rowToStageAttempt);
}

export function getAllInFlightScenes(): Scene[] {
  const rows = db.prepare("SELECT * FROM scenes WHERE status = 'image-generating'").all() as any[];
  return rows.map(rowToScene);
}

export function getSubmittedScenes(): Scene[] {
  const rows = db
    .prepare("SELECT * FROM scenes WHERE status = 'submitted' ORDER BY updated_at ASC")
    .all() as any[];
  return rows.map(rowToScene);
}

export function getSubmittedScenesForRun(runId: string): Scene[] {
  const rows = db
    .prepare("SELECT * FROM scenes WHERE run_id = ? AND status = 'submitted' ORDER BY idx ASC")
    .all(runId) as any[];
  return rows.map(rowToScene);
}

export function markSceneInFlight(sceneId: string, requestId: string, attemptNumber: number): void {
  db.prepare(
    "UPDATE scenes SET status = 'image-generating', current_request_id = ?, attempts = ?, updated_at = ? WHERE id = ?",
  ).run(requestId, attemptNumber, nowIso(), sceneId);
}

// generate-chunk-image (JOS-145), design Decision 4 — the image stage's own
// terminal state, not the scene's final `chunk-complete` (that needs a
// clip too, JOS-146). Renamed from the skeleton's `markSceneComplete`,
// which this replaces as the image stage's completion write.
export function markImageComplete(sceneId: string, result: string): void {
  db.prepare(
    "UPDATE scenes SET status = 'image-complete', result = ?, current_request_id = NULL, updated_at = ? WHERE id = ?",
  ).run(result, nowIso(), sceneId);
}

// design Decision 3 — bound once, atomically: the UPDATE only writes when
// the column is still at the unbound sentinel, so a caller never needs a
// prior read to know whether it is safe to write (the store enforces it,
// not application code, matching this project's other uniqueness guards).
export function bindSceneImageProvider(sceneId: string, identifier: string): void {
  db.prepare("UPDATE scenes SET provider = ? WHERE id = ? AND provider = ?").run(identifier, sceneId, STUB_PROVIDER_NAME);
}

export function markScenePendingRetry(sceneId: string, error: string): void {
  db.prepare(
    "UPDATE scenes SET status = 'submitted', last_error = ?, current_request_id = NULL, updated_at = ? WHERE id = ?",
  ).run(error, nowIso(), sceneId);
}

export function markSceneFailed(sceneId: string, error: string): void {
  db.prepare(
    "UPDATE scenes SET status = 'failed', last_error = ?, current_request_id = NULL, updated_at = ? WHERE id = ?",
  ).run(error, nowIso(), sceneId);
}

export function setSceneInstruction(sceneId: string, instruction: string): void {
  db.prepare("UPDATE scenes SET instruction = ?, updated_at = ? WHERE id = ?").run(instruction, nowIso(), sceneId);
}

/**
 * Decision 3 — the actual store-level uniqueness guarantee. Returns `true`
 * only for the call that genuinely commits the result; a second attempt for
 * the same scene (a duplicate or a concurrent racer) hits the `scene_results`
 * PRIMARY KEY and returns `false`, regardless of what any in-memory flag
 * said. This is what "enforced by the store, not a prior read" means.
 */
export function commitSceneResult(sceneId: string, result: string): boolean {
  try {
    db.prepare("INSERT INTO scene_results (scene_id, result, committed_at) VALUES (?, ?, ?)").run(
      sceneId,
      result,
      nowIso(),
    );
    return true;
  } catch (err: any) {
    if (err?.code === "ERR_SQLITE_ERROR" && /UNIQUE constraint failed/i.test(String(err.message))) {
      return false; // already committed — exactly the duplicate/race case Decision 3 targets
    }
    // A different constraint failure (e.g. a foreign-key violation from a
    // bad sceneId) is a real bug, not a duplicate — let it propagate rather
    // than silently reporting a false negative.
    throw err;
  }
}

export function countSceneResults(sceneId: string): number {
  const row = db.prepare("SELECT COUNT(*) c FROM scene_results WHERE scene_id = ?").get(sceneId) as any;
  return row.c as number;
}

export function insertProviderRequest(
  id: string,
  sceneId: string,
  latencyMs: number,
  mode: ProviderOutcomeMode,
  attemptNumber: number,
): ProviderRequestRow {
  const sentAt = nowIso();
  db.prepare(
    "INSERT INTO provider_requests (id, scene_id, sent_at, latency_ms, mode, attempt_number, resolved) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(id, sceneId, sentAt, latencyMs, mode, attemptNumber);
  return { id, sceneId, sentAt, latencyMs, mode, attemptNumber, resolved: 0 };
}

export function getProviderRequest(id: string): ProviderRequestRow | undefined {
  const row = db.prepare("SELECT * FROM provider_requests WHERE id = ?").get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    sceneId: row.scene_id,
    sentAt: row.sent_at,
    latencyMs: row.latency_ms,
    mode: row.mode,
    attemptNumber: row.attempt_number,
    resolved: row.resolved,
  };
}

/** Test/debug helper: the most recently created provider request for a scene. */
export function getLatestProviderRequestForScene(sceneId: string): ProviderRequestRow | undefined {
  const row = db
    .prepare("SELECT * FROM provider_requests WHERE scene_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(sceneId) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    sceneId: row.scene_id,
    sentAt: row.sent_at,
    latencyMs: row.latency_ms,
    mode: row.mode,
    attemptNumber: row.attempt_number,
    resolved: row.resolved,
  };
}

export function markProviderRequestResolved(id: string): void {
  db.prepare("UPDATE provider_requests SET resolved = 1 WHERE id = ?").run(id);
}

export function sceneCurrentRequestId(sceneId: string): string | null {
  const row = db.prepare("SELECT current_request_id FROM scenes WHERE id = ?").get(sceneId) as any;
  return row?.current_request_id ?? null;
}

/** For test/report state snapshots: counts and key records, independent of any single table's internals. */
export function snapshotCounts(): {
  runs: number;
  scenes: number;
  providerRequests: number;
  sceneResults: number;
  voiceOvers: number;
  stageAttempts: number;
} {
  const runs = (db.prepare("SELECT COUNT(*) c FROM runs").get() as any).c as number;
  const scenes = (db.prepare("SELECT COUNT(*) c FROM scenes").get() as any).c as number;
  const providerRequests = (db.prepare("SELECT COUNT(*) c FROM provider_requests").get() as any).c as number;
  const sceneResults = (db.prepare("SELECT COUNT(*) c FROM scene_results").get() as any).c as number;
  const voiceOvers = (db.prepare("SELECT COUNT(*) c FROM voice_overs").get() as any).c as number;
  const stageAttempts = (db.prepare("SELECT COUNT(*) c FROM stage_attempts").get() as any).c as number;
  return { runs, scenes, providerRequests, sceneResults, voiceOvers, stageAttempts };
}

/** Test-only: wipes every row and every real project folder. Never call this
 * against anything but an isolated `DB_PATH`/`PROJECTS_ROOT` (see the test
 * command in `docs/backend-standards.md`'s persistence section). */
export function resetAll(): void {
  // The one place the delete locks are lifted (lock-script-and-narration
  // Decision 2; assign-scene-identifiers Decision 7): inside a single
  // transaction, so the triggers are back — or the whole reset is rolled
  // back — before anything else can observe the database.
  db.exec("BEGIN");
  try {
    db.exec("DROP TRIGGER voice_overs_no_delete");
    db.exec("DROP TRIGGER scenes_no_delete");
    db.exec("DROP TRIGGER narration_timestamps_no_delete");
    db.exec(
      "DELETE FROM stage_attempts; DELETE FROM narration_timestamps; DELETE FROM voice_overs; DELETE FROM scene_results; DELETE FROM provider_requests; DELETE FROM scenes; DELETE FROM runs;",
    );
    db.exec(VOICE_OVER_NO_DELETE_TRIGGER_DDL);
    db.exec(SCENE_NO_DELETE_TRIGGER_DDL);
    db.exec(NARRATION_TIMESTAMPS_NO_DELETE_TRIGGER_DDL);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  // Tests create real project folders on disk (Decision 4); wipe them too,
  // or a second test run collides with the previous run's leftover folders
  // (found by running the suite twice in a row during this change's own
  // Step 7 verification — a real gap, not hypothetical).
  rmSync(PROJECTS_ROOT, { recursive: true, force: true });
  mkdirSync(PROJECTS_ROOT, { recursive: true });
}
