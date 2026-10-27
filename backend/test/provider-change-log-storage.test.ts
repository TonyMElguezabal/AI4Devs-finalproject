import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo, db, recordProviderChange, resetAll, upsertActiveProviderChoice } from "../src/db.ts";
import { registerScenes } from "./failedStageFixtures.ts";

// record-provider-changes (JOS-229), group 2 — design Decisions 1 and 2: the append-only `provider_changes` table (migration 25),
// its one insert function, and the test reset.

const PREVIOUS_VERSION = 24;
const AT = "2026-10-05T10:00:00.000Z";

function baselineDatabase(): DatabaseSync {
  const target = new DatabaseSync(":memory:");
  target.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
  `);
  return target;
}

const entry = {
  changedAt: AT,
  kind: "active-provider" as const,
  stage: "voice" as const,
  runId: null,
  sceneId: null,
  previousProviderId: "voice-a",
  previousProviderLabel: "Voice A",
  newProviderId: "voice-b",
  newProviderLabel: "Voice B",
};

const rows = () => db.prepare("SELECT * FROM provider_changes ORDER BY id").all() as Array<Record<string, unknown>>;

describe("provider_changes migration", () => {
  it("adds an empty table and leaves existing choices, runs and scenes as they were", () => {
    const target = baselineDatabase();
    applyMigrationsTo(target, PREVIOUS_VERSION);
    target.prepare("INSERT INTO active_providers (stage, provider_id, changed_at) VALUES ('voice', 'voice-a', ?)").run(AT);
    target.prepare("INSERT INTO runs (id, title, created_at) VALUES ('run-1', 'T', ?)").run(AT);
    const snapshot = () => JSON.stringify(["active_providers", "runs", "scenes"].map((table) => target.prepare(`SELECT * FROM ${table}`).all()));
    const before = snapshot();

    const applied = applyMigrationsTo(target);

    expect(applied).toEqual([25]);
    expect(target.prepare("SELECT COUNT(*) AS n FROM provider_changes").get()).toEqual({ n: 0 });
    expect(snapshot()).toBe(before);
  });
});

describe("recordProviderChange", () => {
  beforeEach(() => resetAll());

  it("stores a change of the active provider with its labels and no session", () => {
    recordProviderChange(entry);
    expect(rows()).toEqual([
      {
        id: expect.any(Number),
        changed_at: AT,
        kind: "active-provider",
        stage: "voice",
        run_id: null,
        scene_id: null,
        previous_provider_id: "voice-a",
        previous_provider_label: "Voice A",
        new_provider_id: "voice-b",
        new_provider_label: "Voice B",
      },
    ]);
  });

  it("stores a failed-stage move with its session and scene", async () => {
    const { runId, sceneIds } = await registerScenes([7]);
    recordProviderChange({ ...entry, kind: "failed-stage-move", stage: "video", runId, sceneId: sceneIds[0]! });
    expect(rows()).toMatchObject([{ kind: "failed-stage-move", stage: "video", run_id: runId, scene_id: sceneIds[0] }]);
  });

  it("refuses an unknown kind or stage", () => {
    expect(() => recordProviderChange({ ...entry, kind: "rename" as never })).toThrow(/CHECK/);
    expect(() => recordProviderChange({ ...entry, stage: "audio" as never })).toThrow(/CHECK/);
    expect(rows()).toEqual([]);
  });

  it("is emptied by resetAll, which also clears the choices", () => {
    upsertActiveProviderChoice("voice", "voice-b", AT);
    recordProviderChange(entry);
    resetAll();
    expect(rows()).toEqual([]);
  });
});
