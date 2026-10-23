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
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { stageInstanceKey } from "./retry/retryPolicy.ts";
import { getConsent, normalizeOutcome, recordError, recordProductEvent, recordProviderCall, type BilledUnit } from "./telemetry/index.ts";
import { ulid } from "./util/ulid.ts";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  AttemptTrigger,
  StageAttempt,
  StageAttemptOutcome,
  TimestampMechanism,
  VoiceOver,
  SessionFailure,
  NarrationTimestamps,
  NarrationTimestampsInput,
  VoiceOverInput,
} from "./types.ts";
import { STUB_PROVIDER_NAME } from "./types.ts";

export type { NarrationTimestampsInput, VoiceOverInput } from "./types.ts";

export const DB_PATH = process.env.DB_PATH ?? "data/skeleton.sqlite";
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

// adjust-scene-pause (JOS-190), Decision 3 — a rebuilt final video's record (its version, file and the pause edits it
// was built with) is written once. `resetAll()` (test-only) lifts the delete trigger inside its transaction.
export const FINAL_VIDEO_BUILDS_NO_UPDATE_TRIGGER_DDL = `CREATE TRIGGER final_video_builds_no_update BEFORE UPDATE ON final_video_builds
  BEGIN
    SELECT RAISE(ABORT, 'locked: final_video_builds cannot be modified once recorded');
  END;`;

export const FINAL_VIDEO_BUILDS_NO_DELETE_TRIGGER_DDL = `CREATE TRIGGER final_video_builds_no_delete BEFORE DELETE ON final_video_builds
  BEGIN
    SELECT RAISE(ABORT, 'locked: final_video_builds cannot be deleted once recorded');
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
  {
    version: 12,
    description:
      "add video stage columns, stage column on provider_requests, and scene_video_results table (generate-chunk-video, JOS-146)",
    up: (target) => {
      // Decision 5 — the video stage's provider binding, written once on the first attempt (AC4).
      target.exec("ALTER TABLE scenes ADD COLUMN video_provider TEXT");
      // Decision 5 — the clip's relative path; scenes.result stays the image path.
      target.exec("ALTER TABLE scenes ADD COLUMN video_result TEXT");
      // Decision 5 — which stage each request belongs to; existing rows become 'image'.
      // `provider_requests` is part of the baseline schema for production, but fixture databases
      // used by other migration tests may not have it. Create or ALTER accordingly.
      const hasProviderRequests = (
        target
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_requests'")
          .all()
      ).length > 0;
      if (hasProviderRequests) {
        target.exec("ALTER TABLE provider_requests ADD COLUMN stage TEXT NOT NULL DEFAULT 'image'");
      } else {
        target.exec(`CREATE TABLE provider_requests (
          id TEXT PRIMARY KEY,
          scene_id TEXT NOT NULL,
          sent_at TEXT NOT NULL,
          latency_ms INTEGER NOT NULL,
          mode TEXT NOT NULL,
          attempt_number INTEGER NOT NULL,
          resolved INTEGER NOT NULL DEFAULT 0,
          stage TEXT NOT NULL DEFAULT 'image'
        );`);
      }
      // Decision 5 — mirrors scene_results for the video stage; scene_id PRIMARY KEY refuses a duplicate.
      target.exec(`
        CREATE TABLE scene_video_results (
          scene_id TEXT PRIMARY KEY REFERENCES scenes(id),
          result TEXT NOT NULL,
          committed_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 13,
    description:
      "add runs.final_video_path and make stage_attempts.provider_id nullable (assemble-final-video, JOS-149)",
    up: (target) => {
      target.exec("ALTER TABLE runs ADD COLUMN final_video_path TEXT");
      target.exec(`
        CREATE TABLE stage_attempts_v13 (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(id),
          stage TEXT NOT NULL,
          provider_id TEXT,
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
      target.exec("INSERT INTO stage_attempts_v13 SELECT * FROM stage_attempts");
      target.exec("DROP TABLE stage_attempts");
      target.exec("ALTER TABLE stage_attempts_v13 RENAME TO stage_attempts");
    },
  },
  {
    version: 14,
    description:
      "add the retry budget to stage_attempts: stage instance key, cycle, sequence in cycle, trigger, due time, the scheduled outcome, and the cap of four per cycle (bounded-retry-policy, JOS-184)",
    up: (target) => {
      // Numbered 14 because the integration branch already holds 13 (JOS-149), which also rebuilds stage_attempts. provider_id is nullable here as it is there (the assembly stage has no provider).
      // SQLite cannot alter a CHECK, so the table is rebuilt; a transaction keeps a failed backfill from leaving a half-built table.
      target.exec("BEGIN");
      try {
        const instance = "CASE stage WHEN 'timestamps' THEN 'decomposition' ELSE stage END";
        target.exec(`
          CREATE TABLE stage_attempts_rebuilt (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES runs(id),
            stage TEXT NOT NULL,
            scene_id TEXT,
            stage_instance_key TEXT NOT NULL,
            cycle INTEGER NOT NULL CHECK (cycle >= 1),
            sequence_in_cycle INTEGER NOT NULL CHECK (sequence_in_cycle BETWEEN 1 AND 4),
            attempt_trigger TEXT NOT NULL CHECK (attempt_trigger IN ('initial', 'automatic', 'manual')),
            provider_id TEXT,
            attempt_number INTEGER NOT NULL,
            queued_at TEXT NOT NULL,
            sent_at TEXT,
            due_at TEXT,
            outcome TEXT NOT NULL CHECK (outcome IN ('scheduled', 'in-flight', 'success', 'transient', 'not-retryable')),
            finished_at TEXT,
            external_request_id TEXT,
            error_code TEXT,
            error_message TEXT,
            UNIQUE (run_id, stage, attempt_number),
            UNIQUE (stage_instance_key, cycle, sequence_in_cycle)
          );
          INSERT INTO stage_attempts_rebuilt
            (id, run_id, stage, scene_id, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, outcome, finished_at, external_request_id, error_code, error_message)
          SELECT id, run_id, stage, NULL, run_id || ':' || ${instance}, 1,
                 ROW_NUMBER() OVER (PARTITION BY run_id, ${instance} ORDER BY sent_at, attempt_number),
                 CASE WHEN attempt_number = 1 THEN 'initial' ELSE 'manual' END,
                 provider_id, attempt_number, queued_at, sent_at, outcome, finished_at, external_request_id, error_code, error_message
          FROM stage_attempts;
          DROP TABLE stage_attempts;
          ALTER TABLE stage_attempts_rebuilt RENAME TO stage_attempts;
        `);
        target.exec("COMMIT");
      } catch (err) {
        target.exec("ROLLBACK");
        throw err;
      }
    },
  },
  {
    version: 15,
    description:
      "add the outcomes timed-out, late-success, superseded and cancelled and the late_result_at column to stage_attempts (stage-execution-time-limit, JOS-185)",
    up: (target) => {
      // Numbered 15 because the integration branch holds 14. SQLite cannot alter a CHECK, so the table is rebuilt in a transaction, as migration 14 did.
      target.exec("BEGIN");
      try {
        target.exec(`
          CREATE TABLE stage_attempts_rebuilt (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES runs(id),
            stage TEXT NOT NULL,
            scene_id TEXT,
            stage_instance_key TEXT NOT NULL,
            cycle INTEGER NOT NULL CHECK (cycle >= 1),
            sequence_in_cycle INTEGER NOT NULL CHECK (sequence_in_cycle BETWEEN 1 AND 4),
            attempt_trigger TEXT NOT NULL CHECK (attempt_trigger IN ('initial', 'automatic', 'manual')),
            provider_id TEXT,
            attempt_number INTEGER NOT NULL,
            queued_at TEXT NOT NULL,
            sent_at TEXT,
            due_at TEXT,
            outcome TEXT NOT NULL CHECK (outcome IN ('scheduled', 'in-flight', 'success', 'transient', 'not-retryable', 'timed-out', 'late-success', 'superseded', 'cancelled')),
            finished_at TEXT,
            external_request_id TEXT,
            error_code TEXT,
            error_message TEXT,
            late_result_at TEXT,
            UNIQUE (run_id, stage, attempt_number),
            UNIQUE (stage_instance_key, cycle, sequence_in_cycle)
          );
          INSERT INTO stage_attempts_rebuilt
            (id, run_id, stage, scene_id, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, due_at, outcome, finished_at, external_request_id, error_code, error_message)
          SELECT id, run_id, stage, scene_id, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, due_at, outcome, finished_at, external_request_id, error_code, error_message
          FROM stage_attempts;
          DROP TABLE stage_attempts;
          ALTER TABLE stage_attempts_rebuilt RENAME TO stage_attempts;
        `);
        target.exec("COMMIT");
      } catch (err) {
        target.exec("ROLLBACK");
        throw err;
      }
    },
  },
  {
    version: 16,
    description:
      "add scene_pause_edits (the User's mutable pause intent) and final_video_builds (write-once record of each rebuilt final video) (adjust-scene-pause, JOS-190)",
    up: (target) => {
      // A rebuild the User asked for and that has not finished (possibly held by a pause); see Run.rebuildRequestedAt.
      target.exec("ALTER TABLE runs ADD COLUMN rebuild_requested_at TEXT");
      // Mutable on purpose, and the only mutable timing data: the dial is meant to be turned more than once. It holds
      // User intent only; no locked record is read from or written to here. "No row" means "the original pause".
      target.exec(`
        CREATE TABLE scene_pause_edits (
          scene_id TEXT PRIMARY KEY REFERENCES scenes(id),
          run_id TEXT NOT NULL REFERENCES runs(id),
          pause_seconds REAL NOT NULL CHECK (pause_seconds >= 0),
          updated_at TEXT NOT NULL
        );
        CREATE INDEX scene_pause_edits_run_id ON scene_pause_edits (run_id);
      `);
      // Version 1 is the original final-video.mp4 and has no row (no backfill); a rebuild is version 2 onwards.
      target.exec(`
        CREATE TABLE final_video_builds (
          run_id TEXT NOT NULL REFERENCES runs(id),
          version INTEGER NOT NULL CHECK (version >= 2),
          path TEXT NOT NULL,
          pauses TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (run_id, version)
        );
      `);
      target.exec(FINAL_VIDEO_BUILDS_NO_UPDATE_TRIGGER_DDL);
      target.exec(FINAL_VIDEO_BUILDS_NO_DELETE_TRIGGER_DDL);
    },
  },
  {
    version: 17,
    description: "add the single-row telemetry_settings table, every signal off (add-observability-telemetry, JOS-199)",
    up: (target) => {
      target.exec(`
        CREATE TABLE telemetry_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          errors INTEGER NOT NULL DEFAULT 0 CHECK (errors IN (0, 1)),
          provider_usage INTEGER NOT NULL DEFAULT 0 CHECK (provider_usage IN (0, 1)),
          product_usage INTEGER NOT NULL DEFAULT 0 CHECK (product_usage IN (0, 1)),
          answered_at TEXT,
          install_id TEXT NOT NULL
        );
      `);
      target.prepare("INSERT INTO telemetry_settings (id, install_id) VALUES (1, ?)").run(ulid());
    },
  },
  {
    version: 18,
    description:
      "add the active_providers table and runs.decomposition_provider_id / runs.alignment_provider_id, backfilled from each run's earliest attempt (change-active-provider-from-admin, JOS-171)",
    up: (target) => {
      target.exec(`
        CREATE TABLE active_providers (
          stage TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          changed_at TEXT NOT NULL
        );
      `);
      target.exec("ALTER TABLE runs ADD COLUMN decomposition_provider_id TEXT");
      target.exec("ALTER TABLE runs ADD COLUMN alignment_provider_id TEXT");
      // Only one real adapter per stage has ever existed, so the earliest attempt names the provider the run started with.
      // Native timestamps call no alignment provider, so they bind nothing.
      target.exec(`
        UPDATE runs SET decomposition_provider_id = (
          SELECT provider_id FROM stage_attempts
          WHERE run_id = runs.id AND stage = 'decomposition' AND provider_id IS NOT NULL
          ORDER BY attempt_number LIMIT 1
        );
        UPDATE runs SET alignment_provider_id = (
          SELECT provider_id FROM stage_attempts
          WHERE run_id = runs.id AND stage = 'timestamps' AND provider_id IS NOT NULL AND provider_id <> 'elevenlabs-native'
          ORDER BY attempt_number LIMIT 1
        );
      `);
    },
  },
  {
    version: 19,
    description: "add the provider_profiles table (manage-providers-from-admin, JOS-218); the first profiles are seeded at start-up from the settings",
    up: (target) => {
      target.exec(`
        CREATE TABLE provider_profiles (
          id TEXT PRIMARY KEY,
          stage TEXT NOT NULL,
          adapter_type TEXT NOT NULL,
          label TEXT NOT NULL,
          parameters TEXT NOT NULL,
          api_key_encrypted TEXT,
          retired_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX provider_profiles_stage ON provider_profiles (stage);
      `);
    },
  },
  {
    version: 20,
    description: "add the single-row app_settings table and runs.visual_style_prompt (admin-visual-style-prompt, JOS-201)",
    up: (target) => {
      target.exec(`
        CREATE TABLE app_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          visual_style_prompt TEXT NOT NULL DEFAULT '',
          reference_image_path TEXT,
          reference_image_content_type TEXT,
          updated_at TEXT NOT NULL
        );
        ALTER TABLE runs ADD COLUMN visual_style_prompt TEXT NOT NULL DEFAULT '';
      `);
      target.prepare("INSERT INTO app_settings (id, updated_at) VALUES (1, ?)").run(new Date().toISOString());
    },
  },
  {
    version: 21,
    description: "add provider_requests.provider_id and backfill it from the scene's binding for the attempt's stage (record-attempt-provider, JOS-222)",
    up: (target) => {
      target.exec("ALTER TABLE provider_requests ADD COLUMN provider_id TEXT");
      // `scenes.provider` is part of the baseline schema; the version-1 fixture databases of the migration tests omit it.
      const hasImageBinding = (target.prepare("PRAGMA table_info(scenes)").all() as Array<{ name: string }>).some((c) => c.name === "provider");
      if (!hasImageBinding) return;
      target.exec(`
        UPDATE provider_requests SET provider_id = (
          SELECT CASE WHEN provider_requests.stage = 'video' THEN scenes.video_provider ELSE scenes.provider END
          FROM scenes WHERE scenes.id = provider_requests.scene_id
        );
      `);
    },
  },
];

export function applyMigrationsTo(target: DatabaseSync, upToVersion: number = Number.POSITIVE_INFINITY): number[] {
  target.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (target.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version),
  );
  const justApplied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version) || migration.version > upToVersion) continue;
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

// ---- add-observability-telemetry (JOS-199), Decision 3: opt-in consent, one toggle per signal ----

export type TelemetryConsent = { errors: boolean; providerUsage: boolean; productUsage: boolean };
export type TelemetrySettings = TelemetryConsent & { answered: boolean; installId: string };

export function getTelemetrySettings(target: DatabaseSync = db): TelemetrySettings {
  const row = target.prepare("SELECT * FROM telemetry_settings WHERE id = 1").get() as {
    errors: number;
    provider_usage: number;
    product_usage: number;
    answered_at: string | null;
    install_id: string;
  };
  return {
    errors: row.errors === 1,
    providerUsage: row.provider_usage === 1,
    productUsage: row.product_usage === 1,
    answered: row.answered_at !== null,
    installId: row.install_id,
  };
}

export function saveTelemetryConsent(consent: TelemetryConsent, target: DatabaseSync = db): TelemetrySettings {
  target
    .prepare("UPDATE telemetry_settings SET errors = ?, provider_usage = ?, product_usage = ?, answered_at = ? WHERE id = 1")
    .run(Number(consent.errors), Number(consent.providerUsage), Number(consent.productUsage), new Date().toISOString());
  return getTelemetrySettings(target);
}

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
  } catch (err) {
    throw errorCode(err) === "EEXIST" ? new ArtefactAlreadyExistsError(relativePath) : err;
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return relativePath;
}

export function resolveArtefactPath(projectFolder: string, relativePath: string): string {
  return assertWithinProjectFolder(projectFolder, relativePath);
}

/**
 * keep-project-files-locally (JOS-162), design Decision 5 — a correction
 * can happen more than once, so unlike `script.txt` and `generated-texts.json`
 * this file is a plain overwrite (`writeArtefact`), merging the new field
 * into whatever the project folder already holds for that scene.
 */
function recordCorrectedInstruction(
  projectFolder: string,
  sceneId: string,
  field: "instruction" | "imageInstruction" | "videoInstruction",
  instruction: string,
): void {
  const relativePath = "corrected-instructions.json";
  const fullPath = assertWithinProjectFolder(projectFolder, relativePath);
  let parsed: { scenes: Record<string, Record<string, string>> } = { scenes: {} };
  try {
    parsed = JSON.parse(readFileSync(fullPath, "utf8")) as typeof parsed;
  } catch (err) {
    if (errorCode(err) !== "ENOENT") throw err;
  }
  parsed.scenes[sceneId] = { ...parsed.scenes[sceneId], [field]: instruction, correctedAt: nowIso() };
  writeArtefact(projectFolder, relativePath, JSON.stringify(parsed));
}

/**
 * retry-final-assembly (JOS-159), design Decision 2 — moves an assembly attempt's output from its per-attempt
 * temporary path into the project folder, atomically and only once: `linkSync` is EEXIST-safe, the same idiom
 * `writeArtefactOnce` uses above. `PROJECTS_ROOT` and every project folder are one local filesystem (this app's
 * layout, unconditionally), so no cross-device fallback is needed — ponytail: if that ever stops being true, add
 * an EXDEV -> copyFileSync fallback here. Returns `true` when the file now exists at `relativePath` (moved, or
 * there was nothing at `tempPath` to move — a stub assembly tool in tests writes nothing, and only the caller's
 * own store write matters then) and `false` only when something is already there (`EEXIST`): the caller treats
 * that as superseded, the same as a refused `setFinalVideoPath`.
 */
export function moveAssemblyOutput(projectFolder: string, tempPath: string, relativePath: string): boolean {
  if (!existsSync(tempPath)) return true;
  const fullPath = assertWithinProjectFolder(projectFolder, relativePath);
  try {
    linkSync(tempPath, fullPath);
  } catch (err) {
    if (errorCode(err) === "EEXIST") return false;
    throw err;
  } finally {
    rmSync(tempPath, { force: true });
  }
  return true;
}

/** A loose but good-enough "is this a real MP4" check for the Decision 2 adopt rule: non-empty, with the `ftyp`
 * box signature at offset 4 every MP4 (including this test suite's `buildMp4` fixture) carries. */
export function isReadableMp4(fullPath: string): boolean {
  try {
    const fd = readFileSync(fullPath);
    return fd.length >= 8 && fd.subarray(4, 8).toString("ascii") === "ftyp";
  } catch {
    return false;
  }
}

// ---- admin-visual-style-prompt (JOS-201), Decision 5: the one settings row ----

export const MAX_VISUAL_STYLE_PROMPT_CHARS = 8000;

/** The app data directory: where the database lives. The reference image is stored under it (design Decision 6). */
export const APP_DATA_DIR = dirname(resolve(DB_PATH));

export interface AppSettings {
  visualStylePrompt: string;
  referenceImage: { contentType: string; sizeBytes: number; updatedAt: string } | null;
  updatedAt: string;
}

interface AppSettingsRow {
  visual_style_prompt: string;
  reference_image_path: string | null;
  reference_image_content_type: string | null;
  updated_at: string;
}

/** The absolute path of the stored reference image, or null. Never returned by an endpoint. */
export function getReferenceImageFile(): { path: string; contentType: string } | null {
  const row = getRow<Pick<AppSettingsRow, "reference_image_path" | "reference_image_content_type">>(
    "SELECT reference_image_path, reference_image_content_type FROM app_settings WHERE id = 1",
  );
  if (!row?.reference_image_path || !row.reference_image_content_type) return null;
  return { path: join(APP_DATA_DIR, row.reference_image_path), contentType: row.reference_image_content_type };
}

export function getAppSettings(): AppSettings {
  const row = getRow<AppSettingsRow>("SELECT * FROM app_settings WHERE id = 1")!; // migration 20 inserts the one row
  let referenceImage: AppSettings["referenceImage"] = null;
  const file = getReferenceImageFile();
  if (file) {
    try {
      referenceImage = { contentType: file.contentType, sizeBytes: statSync(file.path).size, updatedAt: row.updated_at };
    } catch {
      referenceImage = null; // the file vanished: report no image rather than a broken one
    }
  }
  return { visualStylePrompt: row.visual_style_prompt, referenceImage, updatedAt: row.updated_at };
}

export function saveVisualStylePrompt(text: string): AppSettings {
  db.prepare("UPDATE app_settings SET visual_style_prompt = ?, updated_at = ? WHERE id = 1").run(text.trim(), nowIso());
  return getAppSettings();
}

/** `relativePath` is relative to `APP_DATA_DIR`, so the stored value works on macOS and Windows. */
export function saveReferenceImage(relativePath: string, contentType: string): AppSettings {
  db.prepare("UPDATE app_settings SET reference_image_path = ?, reference_image_content_type = ?, updated_at = ? WHERE id = 1").run(
    relativePath,
    contentType,
    nowIso(),
  );
  return getAppSettings();
}

export function clearReferenceImage(): AppSettings {
  db.prepare("UPDATE app_settings SET reference_image_path = NULL, reference_image_content_type = NULL, updated_at = ? WHERE id = 1").run(
    nowIso(),
  );
  return getAppSettings();
}

export function createRun(id: string, title: string, script: string, language: string): Run {
  const createdAt = nowIso();
  const projectFolder = deriveAndCreateProjectFolder(title, new Date(createdAt));
  // keep-project-files-locally (JOS-162), Decision 1 — kept in the project
  // folder as well as the `script` column, exactly as submitted.
  writeArtefactOnce(projectFolder, "script.txt", script);
  // admin-visual-style-prompt (JOS-201), Decision 4 — the style at this moment, kept for the run's whole life.
  const visualStylePrompt = getAppSettings().visualStylePrompt;
  db.prepare(
    "INSERT INTO runs (id, title, created_at, paused, language, project_folder, script, visual_style_prompt) VALUES (?, ?, ?, 0, ?, ?, ?, ?)",
  ).run(id, title, createdAt, language, projectFolder, script, visualStylePrompt);
  return { id, title, script, createdAt, paused: false, language, projectFolder, visualStylePrompt, voiceProviderId: null, decompositionProviderId: null, alignmentProviderId: null, failure: null, finalVideoPath: null, rebuildRequestedAt: null };
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
    videoProvider: null,
    videoResult: null,
    updatedAt,
  };
}

/** The one place an untyped `node:sqlite` result becomes a typed row; each caller names the row interface of the table it selected from. */
function getRow<Row>(sql: string, ...params: SQLInputValue[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}

function allRows<Row>(sql: string, ...params: SQLInputValue[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

/** `SELECT COUNT(*) c` — every counting query reads the same shape. */
interface CountRow {
  c: number;
}

/** The `scenes` columns as SQLite stores them. */
interface SceneRow {
  id: string;
  run_id: string;
  idx: number;
  status: SceneState;
  attempts: number;
  last_error: string | null;
  result: string | null;
  instruction: string;
  prompt: string;
  image_instruction: string;
  video_instruction: string;
  narration_start_seconds: number | null;
  narration_end_seconds: number | null;
  requested_duration_seconds: number | null;
  duration_warning: DurationWarning | null;
  speed_factor: number | null;
  speed_factor_warning: SpeedFactorWarning | null;
  provider: string;
  provider_mode: ProviderOutcomeMode;
  provider_latency_ms: number;
  video_provider: string | null;
  video_result: string | null;
  updated_at: string;
}

/** The `runs` columns as SQLite stores them (`paused` is 0/1, `failure` is JSON text). */
interface RunRow {
  id: string;
  title: string;
  script: string | null;
  created_at: string;
  paused: number;
  language: string | null;
  project_folder: string | null;
  voice_provider_id: string | null;
  decomposition_provider_id: string | null;
  alignment_provider_id: string | null;
  visual_style_prompt: string;
  failure: string | null;
  final_video_path: string | null;
  rebuild_requested_at: string | null;
}

interface VoiceOverRow {
  run_id: string;
  audio_path: string;
  timestamps_path: string | null;
  duration_seconds: number;
  size_bytes: number;
  native_timestamps_available: number;
  provider_request_id: string | null;
  completed_at: string;
}

interface NarrationTimestampsRow {
  run_id: string;
  mechanism: TimestampMechanism;
  path: string;
  character_count: number;
  obtained_at: string;
}

interface StageAttemptRow {
  id: string;
  run_id: string;
  stage: AttemptStage;
  scene_id: string | null;
  stage_instance_key: string;
  cycle: number;
  sequence_in_cycle: number;
  attempt_trigger: AttemptTrigger;
  provider_id: string | null;
  attempt_number: number;
  queued_at: string;
  sent_at: string | null;
  due_at: string | null;
  outcome: StageAttemptOutcome;
  finished_at: string | null;
  external_request_id: string | null;
  error_code: string | null;
  error_message: string | null;
  late_result_at: string | null;
}

interface FinalVideoBuildRow {
  run_id: string;
  version: number;
  path: string;
  pauses: string;
  created_at: string;
}

interface ProviderRequestDbRow {
  id: string;
  scene_id: string;
  sent_at: string;
  latency_ms: number;
  mode: ProviderOutcomeMode;
  attempt_number: number;
  resolved: 0 | 1;
  stage: "image" | "video" | null;
  provider_id: string | null;
}

function rowToProviderRequest(row: ProviderRequestDbRow): ProviderRequestRow {
  return {
    id: row.id,
    sceneId: row.scene_id,
    sentAt: row.sent_at,
    latencyMs: row.latency_ms,
    mode: row.mode,
    attemptNumber: row.attempt_number,
    resolved: row.resolved,
    stage: row.stage ?? "image",
    providerId: row.provider_id,
  };
}

/** The Node error code (`ENOENT`, `EEXIST`, …) of a caught value, or undefined when it carries none. */
function errorCode(err: unknown): unknown {
  return (err as { code?: unknown } | null)?.code;
}

/** Whether `err` is the SQLite UNIQUE-constraint failure that the idempotent inserts treat as "already stored". */
function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && errorCode(err) === "ERR_SQLITE_ERROR" && /UNIQUE constraint failed/i.test(err.message);
}

function rowToScene(row: SceneRow): Scene {
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
    videoProvider: row.video_provider ?? null,
    videoResult: row.video_result ?? null,
    updatedAt: row.updated_at,
  };
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    title: row.title,
    script: row.script ?? "",
    createdAt: row.created_at,
    paused: Boolean(row.paused),
    language: row.language ?? "",
    projectFolder: row.project_folder ?? "",
    voiceProviderId: row.voice_provider_id ?? null,
    decompositionProviderId: row.decomposition_provider_id ?? null,
    alignmentProviderId: row.alignment_provider_id ?? null,
    failure: row.failure ? (JSON.parse(row.failure) as SessionFailure) : null,
    finalVideoPath: row.final_video_path ?? null,
    rebuildRequestedAt: row.rebuild_requested_at ?? null,
    visualStylePrompt: row.visual_style_prompt ?? "",
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
  const row = getRow<SceneRow>("SELECT * FROM scenes WHERE id = ?", id);
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
  const row = getRow<SceneRow>("SELECT * FROM scenes WHERE id = ? AND run_id = ?", sceneId, runId);
  return row ? rowToScene(row) : undefined;
}

export function getScenesForRun(runId: string): Scene[] {
  const rows = allRows<SceneRow>("SELECT * FROM scenes WHERE run_id = ? ORDER BY idx ASC", runId);
  return rows.map(rowToScene);
}

/** Every session id, newest first (the failed-stage finder walks them; a local install holds few). */
export function listRunIds(): string[] {
  return (db.prepare("SELECT id FROM runs ORDER BY created_at DESC, id").all() as Array<{ id: string }>).map((row) => row.id);
}

export function getRun(id: string): Run | undefined {
  const row = getRow<RunRow>("SELECT * FROM runs WHERE id = ?", id);
  return row ? rowToRun(row) : undefined;
}

export function setRunPaused(runId: string, paused: boolean): boolean {
  const result = db
    .prepare("UPDATE runs SET paused = ? WHERE id = ? AND paused != ?")
    .run(paused ? 1 : 0, runId, paused ? 1 : 0) as { changes: number };
  return result.changes > 0;
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

/**
 * change-active-provider-from-admin (JOS-171) Decision 3 — the same bind-once rule for the reasoning and the
 * alignment stages, one provider per session.
 */
export function bindDecompositionProvider(runId: string, providerId: string): boolean {
  const result = db.prepare("UPDATE runs SET decomposition_provider_id = ? WHERE id = ? AND decomposition_provider_id IS NULL").run(providerId, runId);
  return Number(result.changes) > 0;
}

export function bindAlignmentProvider(runId: string, providerId: string): boolean {
  const result = db.prepare("UPDATE runs SET alignment_provider_id = ? WHERE id = ? AND alignment_provider_id IS NULL").run(providerId, runId);
  return Number(result.changes) > 0;
}

/**
 * generate-voice-over (JOS-136) Decision 2 — the one write that moves a session
 * to `voice-over-generating`: the provider binding, the end of an earlier
 * failure and the in-flight attempt are committed together, so a crash leaves
 * either all of them or none.
 */
export function startVoiceAttempt(input: { runId: string; providerId: string; queuedAt: string; sentAt: string | null }): StageAttempt {
  db.exec("BEGIN");
  try {
    bindVoiceProvider(input.runId, input.providerId);
    clearRunFailure(input.runId);
    // JOS-167 — a null `sentAt` is an attempt waiting for a slot: scheduled, due now, stamped when it is sent.
    const attempt =
      input.sentAt === null
        ? scheduleStageAttempt({ runId: input.runId, stage: "voice-over", providerId: input.providerId, queuedAt: input.queuedAt, dueAt: input.queuedAt, trigger: "initial" })
        : recordStageAttempt({ runId: input.runId, stage: "voice-over", providerId: input.providerId, queuedAt: input.queuedAt, sentAt: input.sentAt });
    db.exec("COMMIT");
    return attempt;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Clears the session's failure once the phase that failed has succeeded (a retry that worked). A no-op when there is none. */
export function clearRunFailure(runId: string): void {
  db.prepare("UPDATE runs SET failure = NULL WHERE id = ?").run(runId);
}

/**
 * retry-final-assembly (JOS-159), design Decision 3 — the one atomic step a manual assembly retry needs: clear a
 * recorded assembly failure exactly once, so of two racing requests only one proceeds to actually launch
 * (`assemblyRetry.ts` reads `false` as "already pending"). No `stage_attempts` row is touched here — assembly's
 * two pre-attempt failures (no tool, no voice-over) have none to touch, and the launcher records its own on launch.
 */
export function beginAssemblyRetry(runId: string): boolean {
  return inTransaction((): boolean => {
    const run = getRun(runId);
    if (!run || run.failure?.phase !== "assembly") return false;
    clearRunFailure(runId);
    return true;
  });
}

/** Decision 9 — the session's failure, so a failure with no attempt behind it (a missing credential) is still reported. */
export function setRunFailure(runId: string, failure: SessionFailure): void {
  db.prepare("UPDATE runs SET failure = ? WHERE id = ?").run(JSON.stringify(failure), runId);
}

function rowToVoiceOver(row: VoiceOverRow): VoiceOver {
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
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return false;
    }
    throw err; // any other constraint failure (for example an unknown session) is a real bug
  }
}

export function getVoiceOver(runId: string): VoiceOver | undefined {
  const row = getRow<VoiceOverRow>("SELECT * FROM voice_overs WHERE run_id = ?", runId);
  return row ? rowToVoiceOver(row) : undefined;
}

export function countVoiceOvers(runId: string): number {
  const row = getRow<CountRow>("SELECT COUNT(*) c FROM voice_overs WHERE run_id = ?", runId);
  return row?.c ?? 0;
}

function rowToNarrationTimestamps(row: NarrationTimestampsRow): NarrationTimestamps {
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
  } catch (err) {
    if (isUniqueConstraintError(err)) return false;
    throw err;
  }
}

export function getNarrationTimestamps(runId: string): NarrationTimestamps | undefined {
  const row = getRow<NarrationTimestampsRow>("SELECT * FROM narration_timestamps WHERE run_id = ?", runId);
  return row ? rowToNarrationTimestamps(row) : undefined;
}

export function countNarrationTimestamps(runId: string): number {
  return (db.prepare("SELECT COUNT(*) c FROM narration_timestamps WHERE run_id = ?").get(runId) as { c: number }).c;
}

function rowToStageAttempt(row: StageAttemptRow): StageAttempt {
  return {
    id: row.id,
    runId: row.run_id,
    stage: row.stage,
    sceneId: row.scene_id ?? null,
    stageInstanceKey: row.stage_instance_key,
    cycle: row.cycle,
    sequenceInCycle: row.sequence_in_cycle,
    trigger: row.attempt_trigger,
    providerId: row.provider_id,
    attemptNumber: row.attempt_number,
    queuedAt: row.queued_at,
    sentAt: row.sent_at ?? null,
    dueAt: row.due_at ?? null,
    outcome: row.outcome,
    finishedAt: row.finished_at ?? null,
    externalRequestId: row.external_request_id ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    lateResultAt: row.late_result_at ?? null,
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
  /** Required for the scene-level stages (image, video). */
  sceneId?: string;
  providerId: string | null;
  queuedAt: string;
  sentAt: string;
  /** Defaults to the stage instance's latest cycle (1 for the first attempt). A manual retry passes the next one. */
  cycle?: number;
  trigger?: AttemptTrigger;
}): StageAttempt {
  return insertStageAttempt({ ...input, outcome: "in-flight" });
}

/**
 * Bounded-retry-policy Decision 9 — a retry that is persisted with the time it
 * becomes due, before the gate is asked. Takes the next sequence like any
 * attempt; `claimScheduledAttempt` is the only way it becomes in flight.
 */
export function scheduleStageAttempt(input: {
  runId: string;
  stage: AttemptStage;
  sceneId?: string;
  providerId: string | null;
  queuedAt: string;
  dueAt: string;
  cycle?: number;
  trigger?: AttemptTrigger;
}): StageAttempt {
  return insertStageAttempt({ ...input, sentAt: null, outcome: "scheduled" });
}

function insertStageAttempt(input: {
  runId: string;
  stage: AttemptStage;
  sceneId?: string;
  providerId: string | null;
  queuedAt: string;
  sentAt: string | null;
  dueAt?: string;
  cycle?: number;
  trigger?: AttemptTrigger;
  outcome: "in-flight" | "scheduled";
}): StageAttempt {
  const id = randomUUID();
  const stageInstanceKey = stageInstanceKeyOf(input.runId, input.stage, input.sceneId);
  // Bounded-retry-policy Decision 3 — both numbers are computed inside the INSERT; the cap is the table's CHECK.
  const cycle = input.cycle ?? ((db.prepare("SELECT MAX(cycle) c FROM stage_attempts WHERE stage_instance_key = ?").get(stageInstanceKey) as { c: number | null }).c ?? 1);
  db.prepare(
    `INSERT INTO stage_attempts (id, run_id, stage, scene_id, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, due_at, outcome)
     SELECT ?, ?, ?, ?, ?, ?,
            (SELECT COALESCE(MAX(sequence_in_cycle), 0) + 1 FROM stage_attempts WHERE stage_instance_key = ? AND cycle = ?),
            ?, ?, COALESCE(MAX(attempt_number), 0) + 1, ?, ?, ?, ?
     FROM stage_attempts WHERE run_id = ? AND stage = ?`,
  ).run(
    id,
    input.runId,
    input.stage,
    input.sceneId ?? null,
    stageInstanceKey,
    cycle,
    stageInstanceKey,
    cycle,
    input.trigger ?? (cycle === 1 && !hasAttemptIn(stageInstanceKey, 1) ? "initial" : "automatic"),
    input.providerId,
    input.queuedAt,
    input.sentAt,
    input.dueAt ?? null,
    input.outcome,
    input.runId,
    input.stage,
  );
  return rowToStageAttempt(getRow<StageAttemptRow>("SELECT * FROM stage_attempts WHERE id = ?", id)!);
}

/**
 * Decision 9 — moves a scheduled attempt to in flight in one conditional
 * update, so only one of two racing paths (the timer, a launch on continue, a
 * redelivered job) sends it. A due time in the future is not claimable unless
 * `notBefore` is omitted.
 */
export function claimScheduledAttempt(attemptId: string, sentAt: string, notBefore?: string): boolean {
  const result = db
    .prepare(
      "UPDATE stage_attempts SET outcome = 'in-flight', sent_at = ? WHERE id = ? AND outcome = 'scheduled' AND (? IS NULL OR due_at <= ?)",
    )
    .run(sentAt, attemptId, notBefore ?? null, notBefore ?? null);
  return Number(result.changes) > 0;
}

/** JOS-185 Decision 3 — the one update that decides a timeout: only an in-flight attempt can time out, once. */
export function timeOutAttempt(attemptId: string, finishedAt: string, errorMessage?: string): boolean {
  const result = db
    .prepare("UPDATE stage_attempts SET outcome = 'timed-out', finished_at = ?, error_message = ? WHERE id = ? AND outcome = 'in-flight'")
    .run(finishedAt, errorMessage ?? null, attemptId);
  return Number(result.changes) > 0;
}

/** Every attempt that has been sent and has no outcome yet — what the timeout watcher checks against each stage's deadline. */
export function getInFlightAttempts(): StageAttempt[] {
  const rows = allRows<StageAttemptRow>("SELECT * FROM stage_attempts WHERE outcome = 'in-flight' ORDER BY sent_at ASC, attempt_number ASC");
  return rows.map(rowToStageAttempt);
}

/** JOS-185 Decision 4 — a timed-out attempt's result was accepted as the stage instance's result. Once. */
export function acceptLateResult(attemptId: string, lateResultAt: string): boolean {
  return moveTimedOutAttempt(attemptId, "late-success", lateResultAt);
}

/** JOS-185 Decision 4 — a timed-out attempt's result collided with an existing one and was discarded. Once. */
export function supersedeLateResult(attemptId: string, lateResultAt: string): boolean {
  return moveTimedOutAttempt(attemptId, "superseded", lateResultAt);
}

function moveTimedOutAttempt(attemptId: string, outcome: "late-success" | "superseded", lateResultAt: string): boolean {
  const result = db
    .prepare("UPDATE stage_attempts SET outcome = ?, late_result_at = ? WHERE id = ? AND outcome = 'timed-out'")
    .run(outcome, lateResultAt, attemptId);
  return Number(result.changes) > 0;
}

/** JOS-185 Decision 7 — a failure that arrives for a timed-out attempt is kept on that attempt; its outcome and the budget are untouched. */
export function recordLateFailure(attemptId: string, errorMessage: string): boolean {
  const result = db.prepare("UPDATE stage_attempts SET error_message = ? WHERE id = ? AND outcome = 'timed-out'").run(errorMessage, attemptId);
  return Number(result.changes) > 0;
}

/** JOS-185 Decision 5 — cancels every retry of a stage instance that has not been sent; returns how many were cancelled. */
export function cancelScheduledAttemptsOfInstance(stageInstanceKey: string): number {
  const result = db.prepare("UPDATE stage_attempts SET outcome = 'cancelled' WHERE stage_instance_key = ? AND outcome = 'scheduled'").run(stageInstanceKey);
  return Number(result.changes);
}

/** JOS-185 Decision 5 — cancels a retry that has not been sent; the same condition `claimScheduledAttempt` uses, so exactly one of cancel and send wins. */
export function cancelScheduledAttempt(attemptId: string): boolean {
  const result = db.prepare("UPDATE stage_attempts SET outcome = 'cancelled' WHERE id = ? AND outcome = 'scheduled'").run(attemptId);
  return Number(result.changes) > 0;
}

export function getStageAttempt(attemptId: string): StageAttempt | undefined {
  const row = getRow<StageAttemptRow>("SELECT * FROM stage_attempts WHERE id = ?", attemptId);
  return row ? rowToStageAttempt(row) : undefined;
}

/** Every attempt of one stage instance, across cycles, in the order they were made. */
export function getStageInstanceAttempts(stageInstanceKey: string): StageAttempt[] {
  const rows = allRows<StageAttemptRow>(
    "SELECT * FROM stage_attempts WHERE stage_instance_key = ? ORDER BY cycle ASC, sequence_in_cycle ASC",
    stageInstanceKey,
  );
  return rows.map(rowToStageAttempt);
}

/** Every scheduled attempt, earliest due first — what the scheduler rebuilds from at startup. */
export function getScheduledAttempts(): StageAttempt[] {
  const rows = allRows<StageAttemptRow>("SELECT * FROM stage_attempts WHERE outcome = 'scheduled' ORDER BY due_at ASC, attempt_number ASC");
  return rows.map(rowToStageAttempt);
}

/** Runs the writes together or not at all (nested calls join the outer transaction). */
export function inTransaction<T>(work: () => T): T {
  if (db.isTransaction) return work();
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function hasAttemptIn(stageInstanceKey: string, cycle: number): boolean {
  return db.prepare("SELECT 1 FROM stage_attempts WHERE stage_instance_key = ? AND cycle = ? LIMIT 1").get(stageInstanceKey, cycle) !== undefined;
}

/** Decision 1 — the timestamps stage belongs to the single decomposition instance (§5: one state, one retry policy). */
export function stageInstanceKeyOf(runId: string, stage: AttemptStage, sceneId?: string): string {
  return stageInstanceKey({ sessionId: runId, ...(sceneId ? { sceneId } : {}), stage: stage === "timestamps" ? "decomposition" : stage });
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
  const row = db
    .prepare(
      "UPDATE stage_attempts SET outcome = ?, finished_at = ?, external_request_id = ?, error_code = ?, error_message = ? WHERE id = ? AND outcome = 'in-flight' RETURNING run_id, stage, provider_id, sent_at",
    )
    .get(
      outcome.outcome,
      outcome.finishedAt,
      outcome.externalRequestId ?? null,
      outcome.errorCode ?? null,
      outcome.errorMessage ?? null,
      attemptId,
    ) as { run_id: string; stage: string; provider_id: string | null; sent_at: string | null } | undefined;
  if (!row) return false;
  // add-observability-telemetry (JOS-199) Decision 4 — only the completion that changed a row reports, so the
  // `outcome = 'in-flight'` guard above also prevents double counting.
  reportStageAttempt(row, outcome);
  return true;
}

function reportStageAttempt(
  row: { run_id: string; stage: string; provider_id: string | null; sent_at: string | null },
  outcome: { outcome: string; finishedAt: string; errorCode?: string; errorMessage?: string },
): void {
  try {
    const consent = getConsent();
    if (!consent.providerUsage && !consent.errors) return;
    const provider = row.provider_id ?? "unknown";
    const normalized = normalizeOutcome(outcome.outcome);
    let billed: BilledUnit | undefined;
    if (normalized === "success" && row.stage === "voice-over") {
      const script = db.prepare("SELECT length(script) AS characters FROM runs WHERE id = ?").get(row.run_id) as { characters: number } | undefined;
      if (script) billed = { unit: "voice_characters", amount: script.characters };
    }
    const sentAt = row.sent_at ? Date.parse(row.sent_at) : NaN;
    const latencyMs = Number.isNaN(sentAt) ? 0 : Math.max(0, Date.parse(outcome.finishedAt) - sentAt);
    recordProviderCall({ stage: row.stage, provider, outcome: outcome.outcome, latencyMs, billed });
    if (normalized === "not-retryable") {
      recordError({
        stage: row.stage,
        provider,
        errorCode: outcome.errorCode,
        outcome: normalized,
        message: outcome.errorMessage ?? "stage attempt failed",
      });
    }
  } catch {
    // Telemetry must never fail a database write.
  }
}

/**
 * see-provider-and-attempts (JOS-166) Decision 1 — how many requests each scene's image and clip stages have sent,
 * across every retry cycle and counting one still in flight, for a whole session in one query (a snapshot is built
 * on every change, so a query per scene would grow with the number of scenes). Derived from the append-only
 * attempt records, never a counter: `scenes.attempts` is the current cycle's attempt number and restarts for the
 * clip stage. A scene with no request has no entry.
 */
export function countProviderRequestsByScene(runId: string): Map<string, { image: number; video: number }> {
  const rows = db
    .prepare(
      "SELECT p.scene_id AS scene_id, p.stage AS stage, COUNT(*) AS c FROM provider_requests p JOIN scenes s ON s.id = p.scene_id WHERE s.run_id = ? GROUP BY p.scene_id, p.stage",
    )
    .all(runId) as Array<{ scene_id: string; stage: string; c: number }>;
  const counts = new Map<string, { image: number; video: number }>();
  for (const row of rows) {
    const entry = counts.get(row.scene_id) ?? { image: 0, video: 0 };
    if (row.stage === "image" || row.stage === "video") entry[row.stage] = row.c;
    counts.set(row.scene_id, entry);
  }
  return counts;
}

export function getStageAttempts(runId: string, stage: AttemptStage): StageAttempt[] {
  const rows = allRows<StageAttemptRow>(
    "SELECT * FROM stage_attempts WHERE run_id = ? AND stage = ? ORDER BY attempt_number ASC",
    runId,
    stage,
  );
  return rows.map(rowToStageAttempt);
}

/** Sets `runs.final_video_path` once after a successful assembly (JOS-149). */
/**
 * ignore-repeated-success-confirmations (JOS-161), design Decision 2 — the final video is recorded once: the update
 * writes only while no path is recorded. Returns whether this call recorded it.
 */
export function setFinalVideoPath(runId: string, relativePath: string): boolean {
  const result = db.prepare("UPDATE runs SET final_video_path = ? WHERE id = ? AND final_video_path IS NULL").run(relativePath, runId);
  const changed = Number(result.changes) > 0;
  if (changed) recordProductEvent("final_video"); // JOS-199 — only the transition from none to a first final video counts
  return changed;
}

/** Records that a rebuild was asked for. `false` when one is already outstanding or the session has no final video. */
export function requestFinalVideoRebuild(runId: string): boolean {
  const result = db
    .prepare("UPDATE runs SET rebuild_requested_at = ? WHERE id = ? AND final_video_path IS NOT NULL AND rebuild_requested_at IS NULL")
    .run(nowIso(), runId);
  return Number(result.changes) > 0;
}

export function clearFinalVideoRebuildRequest(runId: string): void {
  db.prepare("UPDATE runs SET rebuild_requested_at = NULL WHERE id = ?").run(runId);
}

/**
 * adjust-scene-pause (JOS-190), Decision 3 — moves the current final video to a rebuilt file, only from the path the
 * caller saw, so two rebuilds that both finish cannot both become current (the loser's file is left unreferenced).
 */
export function replaceFinalVideoPath(runId: string, expectedPath: string, newPath: string): boolean {
  const result = db.prepare("UPDATE runs SET final_video_path = ? WHERE id = ? AND final_video_path = ?").run(newPath, runId, expectedPath);
  return Number(result.changes) > 0;
}

// ---- Pause edits and rebuilt final videos (adjust-scene-pause, JOS-190) ----

/** Stores or replaces the User's pause for a scene. Callers have already validated it against the scene's range. */
export function setScenePauseEdit(runId: string, sceneId: string, pauseSeconds: number): void {
  db.prepare(
    "INSERT INTO scene_pause_edits (scene_id, run_id, pause_seconds, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(scene_id) DO UPDATE SET pause_seconds = excluded.pause_seconds, updated_at = excluded.updated_at",
  ).run(sceneId, runId, pauseSeconds, nowIso());
}

/** Back to the original pause: the edit is removed, never stored as an equal value. */
export function clearScenePauseEdit(sceneId: string): void {
  db.prepare("DELETE FROM scene_pause_edits WHERE scene_id = ?").run(sceneId);
}

/** Scene id → the User's pause, for every edited scene of the session. */
export function getScenePauseEdits(runId: string): Map<string, number> {
  const rows = db.prepare("SELECT scene_id, pause_seconds FROM scene_pause_edits WHERE run_id = ?").all(runId) as Array<{
    scene_id: string;
    pause_seconds: number;
  }>;
  return new Map(rows.map((row) => [row.scene_id, row.pause_seconds]));
}

export interface FinalVideoBuild {
  runId: string;
  /** 2 onwards; the original `final-video.mp4` is version 1 and has no record. */
  version: number;
  path: string;
  /** Scene id → the pause that build applied (only edited scenes). */
  pauses: Record<string, number>;
  createdAt: string;
}

export function nextFinalVideoVersion(runId: string): number {
  const row = db.prepare("SELECT MAX(version) AS v FROM final_video_builds WHERE run_id = ?").get(runId) as { v: number | null };
  return (row.v ?? 1) + 1;
}

/** Records a rebuild once. `false` when that version already exists (another rebuild recorded it first). */
export function insertFinalVideoBuild(build: FinalVideoBuild): boolean {
  const result = db
    .prepare("INSERT OR IGNORE INTO final_video_builds (run_id, version, path, pauses, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(build.runId, build.version, build.path, JSON.stringify(build.pauses), build.createdAt);
  return Number(result.changes) > 0;
}

export function getFinalVideoBuilds(runId: string): FinalVideoBuild[] {
  const rows = allRows<FinalVideoBuildRow>("SELECT * FROM final_video_builds WHERE run_id = ? ORDER BY version ASC", runId);
  return rows.map((row) => ({
    runId: row.run_id,
    version: row.version,
    path: row.path,
    pauses: JSON.parse(row.pauses) as Record<string, number>,
    createdAt: row.created_at,
  }));
}

export function getAllInFlightScenes(): Scene[] {
  const rows = allRows<SceneRow>("SELECT * FROM scenes WHERE status = 'image-generating'");
  return rows.map(rowToScene);
}

export function getSubmittedScenes(): Scene[] {
  const rows = allRows<SceneRow>("SELECT * FROM scenes WHERE status = 'submitted' ORDER BY updated_at ASC");
  return rows.map(rowToScene);
}

export function getSubmittedScenesForRun(runId: string): Scene[] {
  const rows = allRows<SceneRow>("SELECT * FROM scenes WHERE run_id = ? AND status = 'submitted' ORDER BY idx ASC", runId);
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

/**
 * retry-or-correct-image (JOS-157), design Decision 3 — the manual-retry command's one conditional write,
 * scoped by session and the two preconditions a retry needs (`failed`, no stored image). Distinct from
 * `markScenePendingRetry` above, which `applyFailureOutcome` still uses unconditionally for the automatic-retry
 * path, where the scene is known to be `image-generating`/`video-generating`, not `failed`, at the moment of the
 * write. Returns whether a row changed, so a lost race (a concurrent retry or correction already moved the scene
 * out of `failed`) is reported the same way as "scene is not failed": `false`, never a thrown error.
 */
export function markSceneForManualRetry(sessionId: string, sceneId: string, error: string): boolean {
  const result = db
    .prepare(
      "UPDATE scenes SET status = 'submitted', last_error = ?, current_request_id = NULL, updated_at = ? WHERE id = ? AND run_id = ? AND status = 'failed' AND result IS NULL",
    )
    .run(error, nowIso(), sceneId, sessionId);
  return Number(result.changes) > 0;
}

/**
 * retry-or-correct-image (JOS-157), design Decisions 3-4 — the correction command's one conditional write for a
 * real chunk: `image_instruction` and `status` change together, so a refused write (scene not failed, or a lost
 * race) never leaves IMAGE corrected on a scene that is not being retried. `last_error` and `current_request_id`
 * are left alone on purpose (task 4.2's column list): a failed scene already has `current_request_id = NULL`, and
 * the stale cause is harmless once the scene is `submitted` again.
 */
export function correctImageInstruction(sessionId: string, sceneId: string, instruction: string): boolean {
  const result = db
    .prepare(
      "UPDATE scenes SET image_instruction = ?, status = 'submitted', updated_at = ? WHERE id = ? AND run_id = ? AND status = 'failed' AND result IS NULL",
    )
    .run(instruction, nowIso(), sceneId, sessionId);
  const changed = Number(result.changes) > 0;
  if (changed) recordCorrectedInstruction(getRun(sessionId)!.projectFolder, sceneId, "imageInstruction", instruction);
  return changed;
}

/**
 * retry-or-correct-image (JOS-157), design Decision 4 — the same conditional write as `correctImageInstruction`,
 * but for a skeleton scene (empty `image_instruction`), which corrects the legacy `instruction` column instead —
 * the field the stub stage (`launchScene`, via `hasImageInstruction`'s own dispatch rule) actually reads.
 */
export function correctLegacyInstruction(sessionId: string, sceneId: string, instruction: string): boolean {
  const result = db
    .prepare(
      "UPDATE scenes SET instruction = ?, status = 'submitted', updated_at = ? WHERE id = ? AND run_id = ? AND status = 'failed' AND result IS NULL",
    )
    .run(instruction, nowIso(), sceneId, sessionId);
  const changed = Number(result.changes) > 0;
  if (changed) recordCorrectedInstruction(getRun(sessionId)!.projectFolder, sceneId, "instruction", instruction);
  return changed;
}

/**
 * retry-or-correct-clip (JOS-158) — conditionally moves a failed clip back to the video launch state.
 * The owning session, failed state, completed image and absent clip are all checked by this one write,
 * so a competing retry/correction or a stale request cannot launch a duplicate attempt.
 */
export function markSceneForManualVideoRetry(sessionId: string, sceneId: string, error: string): boolean {
  const result = db
    .prepare(
      "UPDATE scenes SET status = 'image-complete', last_error = ?, current_request_id = NULL, updated_at = ? WHERE id = ? AND run_id = ? AND status = 'failed' AND result IS NOT NULL AND video_result IS NULL",
    )
    .run(error, nowIso(), sceneId, sessionId);
  return Number(result.changes) > 0;
}

/**
 * retry-or-correct-clip (JOS-158) — the clip correction and transition to the video launch state are atomic.
 * No image, narrative, timing, provider-binding or result field is written here.
 */
export function correctVideoInstruction(sessionId: string, sceneId: string, instruction: string): boolean {
  const result = db
    .prepare(
      "UPDATE scenes SET video_instruction = ?, status = 'image-complete', updated_at = ? WHERE id = ? AND run_id = ? AND status = 'failed' AND result IS NOT NULL AND video_result IS NULL",
    )
    .run(instruction, nowIso(), sceneId, sessionId);
  const changed = Number(result.changes) > 0;
  if (changed) recordCorrectedInstruction(getRun(sessionId)!.projectFolder, sceneId, "videoInstruction", instruction);
  return changed;
}

export function markSceneFailed(sceneId: string, error: string): void {
  db.prepare(
    "UPDATE scenes SET status = 'failed', last_error = ?, current_request_id = NULL, updated_at = ? WHERE id = ?",
  ).run(error, nowIso(), sceneId);
}

// generate-chunk-video (JOS-146) — video-stage lifecycle functions mirroring the image-stage ones.

export function resetAttemptsForVideoStart(sceneId: string): void {
  db.prepare("UPDATE scenes SET attempts = 0 WHERE id = ?").run(sceneId);
}

export function markVideoGenerating(sceneId: string, requestId: string, attemptNumber: number): void {
  db.prepare(
    "UPDATE scenes SET status = 'video-generating', current_request_id = ?, attempts = ?, updated_at = ? WHERE id = ?",
  ).run(requestId, attemptNumber, nowIso(), sceneId);
}

export function markChunkComplete(sceneId: string, videoResult: string): void {
  db.prepare(
    "UPDATE scenes SET status = 'chunk-complete', video_result = ?, current_request_id = NULL, updated_at = ? WHERE id = ?",
  ).run(videoResult, nowIso(), sceneId);
}

export function bindSceneVideoProvider(sceneId: string, identifier: string): void {
  db.prepare("UPDATE scenes SET video_provider = ? WHERE id = ? AND video_provider IS NULL").run(identifier, sceneId);
}

export function markSceneVideoRetry(sceneId: string, error: string): void {
  db.prepare(
    "UPDATE scenes SET status = 'image-complete', last_error = ?, current_request_id = NULL, updated_at = ? WHERE id = ?",
  ).run(error, nowIso(), sceneId);
}

export function getImageCompleteScenesForRun(runId: string): Scene[] {
  const rows = allRows<SceneRow>("SELECT * FROM scenes WHERE run_id = ? AND status = 'image-complete' ORDER BY idx ASC", runId);
  return rows.map(rowToScene);
}

export function getAllVideoGeneratingScenes(): Scene[] {
  const rows = allRows<SceneRow>("SELECT * FROM scenes WHERE status = 'video-generating'");
  return rows.map(rowToScene);
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
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return false; // already committed — exactly the duplicate/race case Decision 3 targets
    }
    // A different constraint failure (e.g. a foreign-key violation from a
    // bad sceneId) is a real bug, not a duplicate — let it propagate rather
    // than silently reporting a false negative.
    throw err;
  }
}

export function countSceneResults(sceneId: string): number {
  const row = getRow<CountRow>("SELECT COUNT(*) c FROM scene_results WHERE scene_id = ?", sceneId);
  return row?.c ?? 0;
}

/** generate-chunk-video (JOS-146) Decision 5 — mirrors `commitSceneResult` for the video stage. */
export function commitSceneVideoResult(sceneId: string, result: string): boolean {
  try {
    db.prepare("INSERT INTO scene_video_results (scene_id, result, committed_at) VALUES (?, ?, ?)").run(
      sceneId,
      result,
      nowIso(),
    );
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return false;
    }
    throw err;
  }
}

export function countSceneVideoResults(sceneId: string): number {
  const row = getRow<CountRow>("SELECT COUNT(*) c FROM scene_video_results WHERE scene_id = ?", sceneId);
  return row?.c ?? 0;
}

export function insertProviderRequest(
  id: string,
  sceneId: string,
  latencyMs: number,
  mode: ProviderOutcomeMode,
  attemptNumber: number,
  stage: "image" | "video" = "image",
): ProviderRequestRow {
  const sentAt = nowIso();
  // record-attempt-provider (JOS-222) Decision 1 — the stage's binding cannot change while an attempt is in flight.
  db.prepare(
    `INSERT INTO provider_requests (id, scene_id, sent_at, latency_ms, mode, attempt_number, resolved, stage, provider_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, (SELECT CASE WHEN ? = 'video' THEN video_provider ELSE provider END FROM scenes WHERE id = ?))`,
  ).run(id, sceneId, sentAt, latencyMs, mode, attemptNumber, stage, stage, sceneId);
  reportProviderRequest(sceneId, latencyMs, mode, stage);
  return getProviderRequest(id)!;
}

/** add-observability-telemetry (JOS-199) Decision 4 — the image and clip stages report here, not through stage attempts. */
function reportProviderRequest(sceneId: string, latencyMs: number, mode: ProviderOutcomeMode, stage: "image" | "video"): void {
  try {
    const consent = getConsent();
    if (!consent.providerUsage && !consent.errors) return;
    const scene = db
      .prepare("SELECT provider, video_provider, requested_duration_seconds FROM scenes WHERE id = ?")
      .get(sceneId) as
      | { provider: string | null; video_provider: string | null; requested_duration_seconds: number | null }
      | undefined;
    if (!scene) return;
    const provider: string = (stage === "video" ? scene.video_provider : scene.provider) ?? "unknown";
    const normalized = normalizeOutcome(mode);
    let billed: BilledUnit | undefined;
    if (stage === "image") billed = { unit: "images", amount: 1 };
    else if (typeof scene.requested_duration_seconds === "number") billed = { unit: "clip_seconds", amount: scene.requested_duration_seconds };
    recordProviderCall({ stage, provider, outcome: mode, latencyMs, billed });
    if (normalized === "not-retryable") {
      recordError({ stage, provider, outcome: normalized, message: `${stage} request failed (${mode})` });
    }
  } catch {
    // Telemetry must never fail a database write.
  }
}

export function getProviderRequest(id: string): ProviderRequestRow | undefined {
  const row = getRow<ProviderRequestDbRow>("SELECT * FROM provider_requests WHERE id = ?", id);
  return row ? rowToProviderRequest(row) : undefined;
}

/** Test/debug helper: the most recently created provider request for a scene. */
export function getLatestProviderRequestForScene(sceneId: string): ProviderRequestRow | undefined {
  const row = getRow<ProviderRequestDbRow>(
    "SELECT * FROM provider_requests WHERE scene_id = ? ORDER BY rowid DESC LIMIT 1",
    sceneId,
  );
  return row ? rowToProviderRequest(row) : undefined;
}

export function markProviderRequestResolved(id: string): void {
  db.prepare("UPDATE provider_requests SET resolved = 1 WHERE id = ?").run(id);
}

export function sceneCurrentRequestId(sceneId: string): string | null {
  const row = getRow<{ current_request_id: string | null }>("SELECT current_request_id FROM scenes WHERE id = ?", sceneId);
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
  const runs = (getRow<CountRow>("SELECT COUNT(*) c FROM runs")?.c ?? 0);
  const scenes = (getRow<CountRow>("SELECT COUNT(*) c FROM scenes")?.c ?? 0);
  const providerRequests = (getRow<CountRow>("SELECT COUNT(*) c FROM provider_requests")?.c ?? 0);
  const sceneResults = (getRow<CountRow>("SELECT COUNT(*) c FROM scene_results")?.c ?? 0);
  const voiceOvers = (getRow<CountRow>("SELECT COUNT(*) c FROM voice_overs")?.c ?? 0);
  const stageAttempts = (getRow<CountRow>("SELECT COUNT(*) c FROM stage_attempts")?.c ?? 0);
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
    db.exec("DROP TRIGGER final_video_builds_no_delete");
    db.exec(
      "DELETE FROM scene_pause_edits; DELETE FROM final_video_builds; DELETE FROM stage_attempts; DELETE FROM narration_timestamps; DELETE FROM voice_overs; DELETE FROM scene_video_results; DELETE FROM scene_results; DELETE FROM provider_requests; DELETE FROM scenes; DELETE FROM runs; DELETE FROM active_providers; DELETE FROM provider_profiles;",
    );
    db.exec(VOICE_OVER_NO_DELETE_TRIGGER_DDL);
    db.exec(SCENE_NO_DELETE_TRIGGER_DDL);
    db.exec(NARRATION_TIMESTAMPS_NO_DELETE_TRIGGER_DDL);
    db.exec(FINAL_VIDEO_BUILDS_NO_DELETE_TRIGGER_DDL);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  for (const listener of storeResetListeners) listener();
  // Tests create real project folders on disk (Decision 4); wipe them too,
  // or a second test run collides with the previous run's leftover folders
  // (found by running the suite twice in a row during this change's own
  // Step 7 verification — a real gap, not hypothetical).
  rmSync(PROJECTS_ROOT, { recursive: true, force: true });
  mkdirSync(PROJECTS_ROOT, { recursive: true });
}

// ---- change-active-provider-from-admin (JOS-171), design Decision 2 — the Administrator's active-provider choices ----

export function getActiveProviderChoice(stage: string): string | null {
  const row = db.prepare("SELECT provider_id FROM active_providers WHERE stage = ?").get(stage) as { provider_id: string } | undefined;
  return row?.provider_id ?? null;
}

export function upsertActiveProviderChoice(stage: string, providerId: string, changedAt: string): void {
  db.prepare(
    "INSERT INTO active_providers (stage, provider_id, changed_at) VALUES (?, ?, ?) ON CONFLICT(stage) DO UPDATE SET provider_id = excluded.provider_id, changed_at = excluded.changed_at",
  ).run(stage, providerId, changedAt);
}

// manage-providers-from-admin (JOS-218) — something that derives state from the stored provider profiles (the adapter
// registries) must start again after a test resets the store. A callback, because the profile module imports this one.
const storeResetListeners: Array<() => void> = [];
export function onStoreReset(listener: () => void): void {
  storeResetListeners.push(listener);
}

// ---- move-failed-stage-to-active-provider (JOS-172) — the Administrator's explicit move of a failed stage ----
// Decision 1: a move binds the stage to the provider that is active now, with a conditional write on the binding the
// page listed, so a stale page or a race changes nothing.

const SESSION_STAGE_COLUMN = { voice: "voice_provider_id", alignment: "alignment_provider_id", reasoning: "decomposition_provider_id" } as const;

export function rebindSessionStage(runId: string, stage: keyof typeof SESSION_STAGE_COLUMN, expectedProviderId: string, newProviderId: string): boolean {
  const column = SESSION_STAGE_COLUMN[stage];
  const result = db.prepare(`UPDATE runs SET ${column} = ? WHERE id = ? AND ${column} = ?`).run(newProviderId, runId, expectedProviderId);
  return Number(result.changes) > 0;
}

export function rebindSceneImageProvider(sceneId: string, expectedProviderId: string, newProviderId: string): boolean {
  const result = db
    .prepare("UPDATE scenes SET provider = ? WHERE id = ? AND provider = ? AND status = 'failed' AND result IS NULL")
    .run(newProviderId, sceneId, expectedProviderId);
  return Number(result.changes) > 0;
}

export interface ClipDurationValues {
  requestedDurationSeconds: number;
  durationWarning: DurationWarning | null;
  speedFactor: number;
  speedFactorWarning: SpeedFactorWarning | null;
}

/**
 * Decision 4 — the ONLY code that changes a chunk's requested duration, duration warning, speed factor or speed-factor
 * warning after registration. For a failed clip with no result, in one transaction: the four lock triggers are dropped,
 * the binding and the four values are written, and the triggers are recreated from the same DDL constants (SQLite DDL is
 * transactional, so a failure rolls the triggers back as well). Nothing else about the chunk is written. A test pins that
 * no other source file drops a trigger.
 */
export function rebindFailedClip(sceneId: string, expectedProviderId: string, newProviderId: string, values: ClipDurationValues): boolean {
  return inTransaction((): boolean => {
    const eligible = db
      .prepare("SELECT 1 FROM scenes WHERE id = ? AND status = 'failed' AND result IS NOT NULL AND video_result IS NULL AND video_provider = ?")
      .get(sceneId, expectedProviderId);
    if (eligible === undefined) return false;
    for (const column of [...LOCKED_SCENE_DURATION_REQUEST_COLUMNS, ...LOCKED_SCENE_SPEED_FACTOR_COLUMNS]) db.exec(`DROP TRIGGER scenes_${column}_locked`);
    db.prepare(
      "UPDATE scenes SET video_provider = ?, requested_duration_seconds = ?, duration_warning = ?, speed_factor = ?, speed_factor_warning = ?, updated_at = ? WHERE id = ?",
    ).run(newProviderId, values.requestedDurationSeconds, values.durationWarning, values.speedFactor, values.speedFactorWarning, nowIso(), sceneId);
    for (const ddl of [...SCENE_DURATION_REQUEST_LOCK_TRIGGERS_DDL, ...SCENE_SPEED_FACTOR_LOCK_TRIGGERS_DDL]) db.exec(ddl);
    return true;
  });
}
