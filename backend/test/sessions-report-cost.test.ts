import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAll } from "../src/db.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { sessionsReport } from "../src/sessionsReport.ts";
import { installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, requestedSecondsOf, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";

// report-estimated-cost (JOS-227), task 5.1 — design Decision 5: the estimated cost of each session in the Sessions report.

const AT = "2026-10-05T10:00:00.000Z";
const BEFORE_PERIOD = "2026-09-05T10:00:00.000Z";

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
  insertProfile({ id: "voice-a", stage: "voice", adapterType: "elevenlabs-voice", label: "Voice A", parameters: { pricePerUnit: 0.01, priceCurrency: "USD" } }, PERIOD.from);
  insertProfile({ id: "vid-a", stage: "video", adapterType: "runninghub-video", label: "Video A", parameters: { pricePerUnit: 0.5, priceCurrency: "EUR" } }, PERIOD.from);
  insertProfile({ id: "img-a", stage: "image", adapterType: "fal-image", label: "Image A", parameters: {} }, PERIOD.from);
});

afterEach(() => removeTwoProvidersPerStage());

/** The sessions report covers sessions created in the period, so the scene sessions it reads are created now. */
const rowOf = (runId: string) => sessionsReport({ to: new Date(Date.now() + 1000).toISOString() }).rows.find((row) => row.id === runId)!;

describe("estimated cost per session", () => {
  it("sums the priced successful attempts per currency, over all of the session's attempts", async () => {
    const { runId, sceneIds } = await registerScenes([5]);
    seedAttempt({ runId, stage: "voice-over", providerId: "voice-a", sentAt: BEFORE_PERIOD, outcome: "success" });
    bindScene(sceneIds[0]!, { videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "transient_failure", latencyMs: 10, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "transient_failure", latencyMs: 10, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "success", latencyMs: 10, sentAt: AT });

    const row = rowOf(runId);
    const script = "scene 1".length;
    expect(row.estimatedCost.map((total) => total.currency)).toEqual(["EUR", "USD"]);
    expect(row.estimatedCost[0]!.estimatedCost).toBeCloseTo(0.5 * requestedSecondsOf(sceneIds[0]!), 10);
    expect(row.estimatedCost[1]!.estimatedCost).toBeCloseTo(0.01 * script, 10);
    expect(row.excludesUnpricedProvider).toBe(false);
  });

  it("notes an unpriced provider of a successful attempt", async () => {
    const { runId, sceneIds } = await registerScenes([5]);
    seedAttempt({ runId, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    bindScene(sceneIds[0]!, { provider: "img-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 10, sentAt: AT });

    expect(rowOf(runId)).toMatchObject({ estimatedCost: [{ currency: "USD" }], excludesUnpricedProvider: true });
  });

  it("ignores an unpriced provider whose attempts all failed", async () => {
    const { runId, sceneIds } = await registerScenes([5]);
    bindScene(sceneIds[0]!, { provider: "img-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "transient_failure", latencyMs: 10, sentAt: AT });

    expect(rowOf(runId)).toMatchObject({ estimatedCost: [], excludesUnpricedProvider: false });
  });

  it("shows no amount when nothing priced succeeded", async () => {
    const { runId } = await registerScenes([5]);
    seedAttempt({ runId, stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    expect(rowOf(runId)).toMatchObject({ estimatedCost: [], excludesUnpricedProvider: false });
  });
});
