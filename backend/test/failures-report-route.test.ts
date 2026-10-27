import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { db, resetAll } from "../src/db.ts";
import { buildApp } from "../src/server.ts";
import { failVideo, installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";

// report-failures-and-retries (JOS-224), group 3 — design Decisions 4–6; JOS-224 AC1, AC4 and AC5 on the API side.

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

const report = (query = "", headers: Record<string, string> = admin) => app.inject({ method: "GET", url: `/admin/reports/failures${query}`, headers });
const periodQuery = `?from=${PERIOD.from}&to=${PERIOD.to}`;

describe("GET /admin/reports/failures", () => {
  it("is refused with 401 without the Administrator password and with a wrong one", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", errorMessage: "MARKER-WORDING" });
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer wrong" }]) {
      const response = await report(periodQuery, headers);
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain("MARKER-WORDING");
    }
  });

  it("answers 200 with the period, the stage rows, the wordings and the scenes failed now", async () => {
    const runId = newRun("Budget", "x".repeat(28));
    for (const outcome of ["transient", "transient", "transient", "timed-out"] as const) {
      seedAttempt({ runId, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome, errorMessage: "The voice provider answered HTTP 503." });
    }
    const { runId: sceneRun, sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 700, sentAt: AT });
    failVideo(sceneRun, sceneIds[0]!);

    const response = await report(periodQuery);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      from: PERIOD.from,
      to: PERIOD.to,
      stages: [
        { stage: "voice", transient: 3, notRetryable: 0, timedOut: 1, budgetsExhausted: 1, manualRetries: 0 },
        { stage: "video", transient: 0, notRetryable: 1, timedOut: 0, budgetsExhausted: null, manualRetries: null },
      ],
      wordings: [{ stage: "voice", message: "The voice provider answered HTTP 503.", attempts: 4 }],
      failedScenesNow: { image: 0, video: 1 },
    });
  });

  it("without a period reports all time up to now", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    const body = (await report()).json<{ from: string | null; to: string; stages: unknown[] }>();
    expect(body.from).toBeNull();
    expect(Date.parse(body.to)).toBeLessThanOrEqual(Date.now());
    expect(body.stages).toHaveLength(1);
  });

  it("answers 400 when from is not before to, or is not a date-time", async () => {
    for (const query of [`?from=${PERIOD.to}&to=${PERIOD.from}`, `?from=${PERIOD.from}&to=${PERIOD.from}`, "?from=yesterday"]) {
      const response = await report(query);
      expect(response.statusCode).toBe(400);
    }
  });

  it("holds no scene failure text, script or stored key, and changes nothing", async () => {
    const { runId, sceneIds } = await registerScenes([7]);
    failVideo(runId, sceneIds[0]!);
    db.prepare("UPDATE scenes SET last_error = 'MARKER-SCENE-FAILURE' WHERE id = ?").run(sceneIds[0]!);
    seedAttempt({ runId: newRun("Marker", "MARKER-SCRIPT lighthouse"), stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 700, sentAt: AT });
    const counts = () =>
      JSON.stringify(
        db
          .prepare("SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM scenes) AS scenes, (SELECT COUNT(*) FROM stage_attempts) AS attempts, (SELECT COUNT(*) FROM provider_requests) AS requests, (SELECT COUNT(*) FROM provider_profiles) AS profiles, (SELECT COUNT(*) FROM active_providers) AS active")
          .get(),
      );
    const before = counts();

    const response = await report(periodQuery);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("MARKER-SCENE-FAILURE");
    expect(response.body).not.toContain("MARKER-SCRIPT");
    expect(counts()).toBe(before);
  });
});
