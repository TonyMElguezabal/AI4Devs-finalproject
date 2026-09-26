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
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProviderOutcomeMode, ProviderRequestRow, Run, Scene, SceneState } from "./types.ts";
import { STUB_PROVIDER_NAME } from "./types.ts";

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

/** Decision 4 — artefacts are written relative to the session's recorded
 * folder. Returns the relative path stored on the scene record. */
export function writeArtefact(projectFolder: string, relativePath: string, content: string): string {
  const fullPath = join(PROJECTS_ROOT, projectFolder, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
  return relativePath;
}

export function resolveArtefactPath(projectFolder: string, relativePath: string): string {
  return join(PROJECTS_ROOT, projectFolder, relativePath);
}

export function createRun(id: string, title: string, language: string): Run {
  const createdAt = nowIso();
  const projectFolder = deriveAndCreateProjectFolder(title, new Date(createdAt));
  db.prepare(
    "INSERT INTO runs (id, title, created_at, paused, language, project_folder) VALUES (?, ?, ?, 0, ?, ?)",
  ).run(id, title, createdAt, language, projectFolder);
  return { id, title, createdAt, paused: false, language, projectFolder };
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
    createdAt: row.created_at,
    paused: Boolean(row.paused),
    language: row.language ?? "",
    projectFolder: row.project_folder ?? "",
  };
}

export function getScene(id: string): Scene | undefined {
  const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as any;
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

export function markSceneComplete(sceneId: string, result: string): void {
  db.prepare(
    "UPDATE scenes SET status = 'chunk-complete', result = ?, current_request_id = NULL, updated_at = ? WHERE id = ?",
  ).run(result, nowIso(), sceneId);
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
} {
  const runs = (db.prepare("SELECT COUNT(*) c FROM runs").get() as any).c as number;
  const scenes = (db.prepare("SELECT COUNT(*) c FROM scenes").get() as any).c as number;
  const providerRequests = (db.prepare("SELECT COUNT(*) c FROM provider_requests").get() as any).c as number;
  const sceneResults = (db.prepare("SELECT COUNT(*) c FROM scene_results").get() as any).c as number;
  return { runs, scenes, providerRequests, sceneResults };
}

/** Test-only: wipes every row and every real project folder. Never call this
 * against anything but an isolated `DB_PATH`/`PROJECTS_ROOT` (see the test
 * command in `docs/backend-standards.md`'s persistence section). */
export function resetAll(): void {
  db.exec("DELETE FROM scene_results; DELETE FROM provider_requests; DELETE FROM scenes; DELETE FROM runs;");
  // Tests create real project folders on disk (Decision 4); wipe them too,
  // or a second test run collides with the previous run's leftover folders
  // (found by running the suite twice in a row during this change's own
  // Step 7 verification — a real gap, not hypothetical).
  rmSync(PROJECTS_ROOT, { recursive: true, force: true });
  mkdirSync(PROJECTS_ROOT, { recursive: true });
}
