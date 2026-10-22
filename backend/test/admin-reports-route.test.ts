import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { db, resetAll } from "../src/db.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";
import { installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";

// report-provider-usage (JOS-223), group 3 — design Decisions 1, 4 and 5; JOS-223 AC2, AC5 and AC6 on the API side.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const AT = "2026-10-05T10:00:00.000Z";

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

const report = (query = "", headers: Record<string, string> = admin) => app.inject({ method: "GET", url: `/admin/reports/provider-usage${query}`, headers });
const periodQuery = `?from=${PERIOD.from}&to=${PERIOD.to}`;

describe("GET /admin/reports/provider-usage", () => {
  it("is refused with 401 without the Administrator password and with a wrong one", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer wrong" }]) {
      const response = await report(periodQuery, headers);
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain("voice-a");
    }
  });

  it("answers 200 with the period, the attribution flag and one row per stage and provider", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", latencyMs: 1000, scriptLength: 28 });

    const response = await report(periodQuery);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      from: PERIOD.from,
      to: PERIOD.to,
      sceneAttemptsFollowCurrentProvider: true,
      rows: [
        {
          stage: "voice",
          providerId: "voice-a",
          providerLabel: "voice-a",
          attempts: 1,
          successes: 1,
          transient: 0,
          notRetryable: 0,
          timedOut: 0,
          successRatePercent: 100,
          medianLatencyMs: 1000,
          p95LatencyMs: 1000,
          billedUnits: 28,
          unit: "voice_characters",
        },
      ],
    });
  });

  it("counts everything up to now when neither bound is given", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    const before = Date.now();

    const body = (await report()).json();

    expect(body.from).toBeNull();
    expect(Date.parse(body.to)).toBeGreaterThanOrEqual(before);
    expect(body.rows).toHaveLength(1);
  });

  it("selects the same attempts for bounds with an offset as for their UTC equivalents", async () => {
    seedAttempt({ stage: "voice-over", providerId: "inside", sentAt: "2026-10-05T10:00:00.000Z", outcome: "success" });
    seedAttempt({ stage: "voice-over", providerId: "outside", sentAt: "2026-10-05T11:30:00.000Z", outcome: "success" });

    const withOffset = await report(`?from=${encodeURIComponent("2026-10-05T12:00:00+02:00")}&to=${encodeURIComponent("2026-10-05T13:00:00+02:00")}`);
    const inUtc = await report(`?from=${encodeURIComponent("2026-10-05T10:00:00Z")}&to=${encodeURIComponent("2026-10-05T11:00:00Z")}`);

    expect(withOffset.json().rows.map((row: { providerId: string }) => row.providerId)).toEqual(["inside"]);
    expect(withOffset.json()).toEqual(inUtc.json());
  });

  it.each([
    ["`from` after `to`", `?from=${PERIOD.to}&to=${PERIOD.from}`, "from"],
    ["`from` equal to `to`", `?from=${PERIOD.from}&to=${PERIOD.from}`, "from"],
    ["`from` that is not a date-time", "?from=yesterday", "from"],
    ["`to` that is not a date-time", "?to=tomorrow", "to"],
    ["a date without a time", "?from=2026-10-01", "from"],
  ])("answers 400 naming the parameter for %s", async (_name, query, parameter) => {
    const response = await report(query);
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain(parameter);
  });

  it("contains no script, prompt, instruction, failure text or stored key, and changes no table", async () => {
    const markers = ["MARK-SCRIPT", "MARK-INSTRUCTION", "MARK-FAILURE", "MARK-KEY"];
    insertProfile({ id: "voice-a", stage: "voice", adapterType: "stub", label: "Voice A", parameters: {} }, PERIOD.from);
    db.prepare("UPDATE provider_profiles SET api_key_encrypted = 'MARK-KEY' WHERE id = 'voice-a'").run();
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", runId: newRun("Usage", "MARK-SCRIPT") });
    db.prepare("UPDATE stage_attempts SET error_message = 'MARK-FAILURE'").run();
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    db.prepare("UPDATE scenes SET image_instruction = 'MARK-INSTRUCTION', video_instruction = 'MARK-INSTRUCTION'").run();
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 10, sentAt: AT });
    const countsBefore = rowCounts();

    const response = await report(periodQuery);

    expect(response.statusCode).toBe(200);
    expect(response.json().rows.length).toBeGreaterThan(0);
    for (const marker of markers) expect(response.body).not.toContain(marker);
    expect(rowCounts()).toEqual(countsBefore);
  });

  it("is in the generated OpenAPI document", async () => {
    await app.ready();
    const document = app.swagger() as { paths: Record<string, { get?: unknown }> };
    expect(document.paths["/admin/reports/provider-usage"]?.get).toBeDefined();
  });
});

/** The number of rows of every table. */
function rowCounts(): Record<string, number> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as unknown as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => [name, (db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as unknown as { n: number }).n]));
}
