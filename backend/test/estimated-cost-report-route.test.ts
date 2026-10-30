import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { db, resetAll } from "../src/db.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";
import { installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";

// report-estimated-cost (JOS-227), task 4.1 — design Decision 3; the report rules of `admin-reports` (JOS-223).

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

const report = (query = "", headers: Record<string, string> = admin) => app.inject({ method: "GET", url: `/admin/reports/estimated-cost${query}`, headers });
const periodQuery = `?from=${PERIOD.from}&to=${PERIOD.to}`;

describe("GET /admin/reports/estimated-cost", () => {
  it("is refused with 401 without the Administrator password and with a wrong one", async () => {
    insertProfile({ id: "voice-a", stage: "voice", adapterType: "elevenlabs-voice", label: "Voice A", parameters: { pricePerUnit: 0.5, priceCurrency: "USD" } }, PERIOD.from);
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer wrong" }]) {
      const response = await report(periodQuery, headers);
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain("Voice A");
    }
  });

  it("answers 200 with the period, the rows, the totals and the exclusion flag", async () => {
    insertProfile({ id: "voice-a", stage: "voice", adapterType: "elevenlabs-voice", label: "Voice A", parameters: { pricePerUnit: 0.5, priceCurrency: "USD" } }, PERIOD.from);
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", scriptLength: 4 });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", scriptLength: 6 });
    seedAttempt({ stage: "decomposition", providerId: "llm-x", sentAt: AT, outcome: "success" });

    const response = await report(periodQuery);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      from: PERIOD.from,
      to: PERIOD.to,
      sceneAttemptsFollowCurrentProvider: true,
      rows: [
        { stage: "voice", providerId: "voice-a", providerLabel: "Voice A", unit: "voice_characters", billedUnits: 4, failedUnits: 6, pricePerUnit: 0.5, currency: "USD", estimatedCost: 2 },
        { stage: "reasoning", providerId: "llm-x", providerLabel: "llm-x", unit: "requests", billedUnits: 1, failedUnits: 0, pricePerUnit: null, currency: null, estimatedCost: null },
      ],
      totals: [{ currency: "USD", estimatedCost: 2 }],
      totalsExcludeUnpriced: true,
    });
  });

  it("answers 400 when from is not before to, or is not a date-time", async () => {
    for (const query of [`?from=${PERIOD.to}&to=${PERIOD.from}`, "?from=yesterday"]) {
      const response = await report(query);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ message: string }>().message).toContain("from");
    }
  });

  it("contains no script, instruction, failure text or stored key, and changes no table", async () => {
    insertProfile({ id: "voice-a", stage: "voice", adapterType: "elevenlabs-voice", label: "Voice A", parameters: { pricePerUnit: 1, priceCurrency: "USD" } }, PERIOD.from);
    db.prepare("UPDATE provider_profiles SET api_key_encrypted = 'MARK-KEY' WHERE id = 'voice-a'").run();
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", runId: newRun("Cost", "MARK-SCRIPT") });
    db.prepare("UPDATE stage_attempts SET error_message = 'MARK-FAILURE'").run();
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { videoProvider: "vid-a" });
    db.prepare("UPDATE scenes SET image_instruction = 'MARK-INSTRUCTION', video_instruction = 'MARK-INSTRUCTION', last_error = 'MARK-FAILURE'").run();
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "success", latencyMs: 10, sentAt: AT });
    const counts = () => JSON.stringify(db.prepare("SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM scenes) AS scenes, (SELECT COUNT(*) FROM stage_attempts) AS attempts, (SELECT COUNT(*) FROM provider_requests) AS requests, (SELECT COUNT(*) FROM provider_profiles) AS profiles").get());
    const before = counts();

    const response = await report(periodQuery);

    expect(response.statusCode).toBe(200);
    for (const marker of ["MARK-SCRIPT", "MARK-INSTRUCTION", "MARK-FAILURE", "MARK-KEY"]) expect(response.body).not.toContain(marker);
    expect(counts()).toBe(before);
  });

  it("is in the generated OpenAPI document", async () => {
    await app.ready();
    const document = app.swagger() as { paths: Record<string, { get?: unknown }> };
    expect(document.paths["/admin/reports/estimated-cost"]?.get).toBeDefined();
  });
});
