import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { db, resetAll } from "../src/db.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";
import { installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";
import { seedSession } from "./sessionsReportFixtures.ts";

// report-sessions (JOS-225), group 3 — design Decisions 1, 2 and 6; JOS-225 AC1 to AC5 on the API side.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const CREATED = "2026-10-05T10:00:00.000Z";

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  installTwoProvidersPerStage();
  setAdminPasswordReader(() => PASSWORD);
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  resetAdminPasswordReader();
  removeTwoProvidersPerStage();
  resetAll();
});

const sessions = (query = "", headers: Record<string, string> = admin) => app.inject({ method: "GET", url: `/admin/reports/sessions${query}`, headers });
const scenes = (sessionId: string, headers: Record<string, string> = admin) => app.inject({ method: "GET", url: `/admin/reports/sessions/${sessionId}/scenes`, headers });
const periodQuery = `?from=${PERIOD.from}&to=${PERIOD.to}`;

/** The number of rows of every table. */
function rowCounts(): Record<string, number> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as unknown as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => [name, (db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as unknown as { n: number }).n]));
}

describe("GET /admin/reports/sessions", () => {
  it("is refused with 401 without the Administrator password and with a wrong one", async () => {
    seedSession({ title: "MARKER-TITLE", createdAt: CREATED });
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer wrong" }]) {
      const response = await sessions(periodQuery, headers);
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain("MARKER-TITLE");
    }
  });

  it("answers 200 with the period and one row per session", async () => {
    const id = seedSession({ title: "Lighthouse", createdAt: CREATED, paused: true, voiceOverAfter: 0.1, assemblyAfter: 18.1 });

    const response = await sessions(periodQuery);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      from: PERIOD.from,
      to: PERIOD.to,
      rows: [
        {
          id,
          title: "Lighthouse",
          createdAt: CREATED,
          state: "final-video-ready",
          failedPhase: null,
          paused: true,
          scenes: 0,
          failedScenes: 0,
          attempts: 0,
          secondsToVoiceOver: 0.1,
          secondsToFinalVideo: 18.1,
          estimatedCost: [],
          excludesUnpricedProvider: false,
        },
      ],
    });
  });

  it("lists every session when neither bound is given", async () => {
    seedSession({ createdAt: "2020-01-01T00:00:00.000Z" });
    const body = (await sessions()).json<{ from: string | null; to: string; rows: unknown[] }>();
    expect(body.from).toBeNull();
    expect(Date.parse(body.to)).toBeLessThanOrEqual(Date.now());
    expect(body.rows).toHaveLength(1);
  });

  it("selects the same sessions for bounds with an offset as for their UTC equivalents", async () => {
    const inside = seedSession({ title: "inside", createdAt: "2026-10-05T10:00:00.000Z" });
    seedSession({ title: "outside", createdAt: "2026-10-05T11:30:00.000Z" });

    const withOffset = await sessions(`?from=${encodeURIComponent("2026-10-05T12:00:00+02:00")}&to=${encodeURIComponent("2026-10-05T13:00:00+02:00")}`);
    const inUtc = await sessions(`?from=${encodeURIComponent("2026-10-05T10:00:00Z")}&to=${encodeURIComponent("2026-10-05T11:00:00Z")}`);

    expect(withOffset.json().rows.map((row: { id: string }) => row.id)).toEqual([inside]);
    expect(withOffset.json()).toEqual(inUtc.json());
  });

  it.each([
    ["`from` after `to`", `?from=${PERIOD.to}&to=${PERIOD.from}`, "from"],
    ["`from` equal to `to`", `?from=${PERIOD.from}&to=${PERIOD.from}`, "from"],
    ["`from` that is not a date-time", "?from=yesterday", "from"],
    ["`to` that is not a date-time", "?to=tomorrow", "to"],
  ])("answers 400 naming the parameter for %s", async (_name, query, parameter) => {
    const response = await sessions(query);
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain(parameter);
  });
});

describe("GET /admin/reports/sessions/:sessionId/scenes", () => {
  it("is refused with 401 without the Administrator password and with a wrong one", async () => {
    const id = seedSession({ createdAt: CREATED });
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer wrong" }]) {
      expect((await scenes(id, headers)).statusCode).toBe(401);
    }
  });

  it("answers 200 with one row per scene in scene order", async () => {
    insertProfile({ id: "img-a", stage: "image", adapterType: "stub", label: "Image A", parameters: {} }, CREATED);
    const { runId, sceneIds } = await registerScenes([7, 8]);
    bindScene(sceneIds[0]!, { provider: "img-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 10, sentAt: CREATED });

    const response = await scenes(runId);

    expect(response.statusCode).toBe(200);
    const body = response.json<{ sessionId: string; rows: Array<Record<string, unknown>> }>();
    expect(body.sessionId).toBe(runId);
    expect(body.rows.map((row) => row.number)).toEqual([1, 2]);
    expect(body.rows[0]).toMatchObject({ imageProvider: "Image A", imageAttempts: 1, clipAttempts: 0, speedFactorWarning: null });
    expect(Object.keys(body.rows[0]!).sort()).toEqual(
      ["clipAttempts", "clipProvider", "durationWarning", "imageAttempts", "imageProvider", "number", "requestedDurationSeconds", "speedFactor", "speedFactorWarning", "status"].sort(),
    );
  });

  it("answers 200 with no rows for a session without scenes, and 404 for an unknown session", async () => {
    const id = seedSession({ createdAt: CREATED, failure: "voice-over" });
    expect((await scenes(id)).json()).toEqual({ sessionId: id, rows: [] });
    expect((await scenes("no-such-session")).statusCode).toBe(404);
  });
});

describe("the sessions routes — what they never contain", () => {
  it("hold no script, instruction, failure text, error message or stored key, and change no table", async () => {
    const markers = ["MARK-SCRIPT", "MARK-INSTRUCTION", "MARK-FAILURE", "MARK-ERROR", "MARK-KEY"];
    insertProfile({ id: "voice-a", stage: "voice", adapterType: "stub", label: "Voice A", parameters: {} }, CREATED);
    db.prepare("UPDATE provider_profiles SET api_key_encrypted = 'MARK-KEY' WHERE id = 'voice-a'").run();
    const failed = seedSession({ title: "Failed one", script: "MARK-SCRIPT lighthouse", createdAt: CREATED, voiceOverAfter: 5, failure: "assembly", failureCause: "MARK-FAILURE" });
    seedAttempt({ runId: failed, stage: "voice-over", providerId: "voice-a", sentAt: CREATED, outcome: "transient" });
    db.prepare("UPDATE stage_attempts SET error_message = 'MARK-ERROR'").run();
    const { runId, sceneIds } = await registerScenes([7]);
    db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run(CREATED, runId);
    db.prepare("UPDATE scenes SET image_instruction = 'MARK-INSTRUCTION', video_instruction = 'MARK-INSTRUCTION', last_error = 'MARK-ERROR' WHERE id = ?").run(sceneIds[0]!);
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 10, sentAt: CREATED });
    const countsBefore = rowCounts();

    const list = await sessions(periodQuery);
    const drillDown = await scenes(runId);
    const failedDrillDown = await scenes(failed);

    expect(list.statusCode).toBe(200);
    expect(list.json().rows).toHaveLength(2);
    for (const response of [list, drillDown, failedDrillDown]) {
      for (const marker of markers) expect(response.body).not.toContain(marker);
    }
    expect(rowCounts()).toEqual(countsBefore);
  });

  it("are in the generated OpenAPI document", async () => {
    await app.ready();
    const document = app.swagger() as { paths: Record<string, { get?: unknown }> };
    expect(document.paths["/admin/reports/sessions"]?.get).toBeDefined();
    expect(document.paths["/admin/reports/sessions/{sessionId}/scenes"]?.get).toBeDefined();
  });
});
