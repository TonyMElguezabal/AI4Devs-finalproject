import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAll } from "../src/db.ts";
import { estimatedCostReport } from "../src/estimatedCostReport.ts";
import { insertProfile, updateProfile } from "../src/providerProfiles.ts";
import { providerUsageReport } from "../src/providerUsageReport.ts";
import type { ProviderStage } from "../src/providerTypes.ts";
import { installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, requestedSecondsOf, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";

// report-estimated-cost (JOS-227), task 3.1 — design Decisions 2 and 4: billed units times the current price, per currency.

const AT = "2026-10-05T10:00:00.000Z";
const NOW = "2026-10-01T00:00:00.000Z";
const ADAPTER: Record<ProviderStage, string> = { voice: "elevenlabs-voice", alignment: "elevenlabs-alignment", reasoning: "openai-reasoning", image: "fal-image", video: "runninghub-video" };

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
});

afterEach(() => removeTwoProvidersPerStage());

function profile(id: string, stage: ProviderStage, price?: { pricePerUnit: number; priceCurrency: string }): void {
  insertProfile({ id, stage, adapterType: ADAPTER[stage], label: `Label ${id}`, parameters: { ...price } }, NOW);
}

/** One scene bound to `providers`, with the given image and clip attempts; returns its requested clip seconds. */
async function seedScene(providers: { provider?: string; videoProvider?: string }, attempts: { stage: "image" | "video"; mode: "success" | "transient_failure" | "not_retryable_failure" }[]): Promise<number> {
  const { sceneIds } = await registerScenes([5]);
  bindScene(sceneIds[0]!, providers);
  for (const attempt of attempts) seedSceneAttempt({ sceneId: sceneIds[0]!, ...attempt, latencyMs: 10, sentAt: AT });
  return requestedSecondsOf(sceneIds[0]!);
}

const rowOf = (providerId: string) => estimatedCostReport(PERIOD).rows.find((row) => row.providerId === providerId);

describe("estimatedCostReport", () => {
  it("prices billed units, shows failed units unpriced, and gives the profile's label and unit", async () => {
    profile("vid-a", "video", { pricePerUnit: 0.05, priceCurrency: "USD" });
    const seconds = await seedScene({ videoProvider: "vid-a" }, [
      { stage: "video", mode: "transient_failure" },
      { stage: "video", mode: "transient_failure" },
      { stage: "video", mode: "success" },
    ]);

    const row = rowOf("vid-a")!;
    expect(row).toMatchObject({ stage: "video", providerLabel: "Label vid-a", unit: "clip_seconds", billedUnits: seconds, failedUnits: 2 * seconds, pricePerUnit: 0.05, currency: "USD" });
    expect(row.estimatedCost).toBeCloseTo(0.05 * seconds, 10);
  });

  it("treats a price of zero as priced", () => {
    profile("voice-a", "voice", { pricePerUnit: 0, priceCurrency: "EUR" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", scriptLength: 20 });
    expect(rowOf("voice-a")).toMatchObject({ estimatedCost: 0, currency: "EUR" });
    expect(estimatedCostReport(PERIOD)).toMatchObject({ totals: [{ currency: "EUR", estimatedCost: 0 }], totalsExcludeUnpriced: false });
  });

  it("leaves a provider with no price, and an id with no profile, unpriced and out of the totals", async () => {
    profile("img-a", "image");
    profile("voice-a", "voice", { pricePerUnit: 0.001, priceCurrency: "USD" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", scriptLength: 1000 });
    await seedScene({ provider: "img-a" }, [{ stage: "image", mode: "success" }]);
    seedAttempt({ stage: "decomposition", providerId: "no-such-profile", sentAt: AT, outcome: "success" });

    const report = estimatedCostReport(PERIOD);
    expect(rowOf("img-a")).toMatchObject({ billedUnits: 1, pricePerUnit: null, currency: null, estimatedCost: null });
    expect(rowOf("no-such-profile")).toMatchObject({ providerLabel: "no-such-profile", pricePerUnit: null, currency: null, estimatedCost: null });
    expect(report.totals).toEqual([{ currency: "USD", estimatedCost: 1 }]);
    expect(report.totalsExcludeUnpriced).toBe(true);
  });

  it("uses the price stored now", () => {
    profile("voice-a", "voice", { pricePerUnit: 1, priceCurrency: "USD" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", scriptLength: 10 });
    updateProfile("voice-a", { label: "Label voice-a", parameters: { pricePerUnit: 2, priceCurrency: "USD" } }, NOW);
    expect(rowOf("voice-a")).toMatchObject({ pricePerUnit: 2, estimatedCost: 20 });
  });

  it("gives one total per currency, ordered by code, and never adds currencies together", () => {
    profile("voice-a", "voice", { pricePerUnit: 0.1, priceCurrency: "USD" });
    profile("voice-b", "voice", { pricePerUnit: 0.5, priceCurrency: "EUR" });
    profile("llm-a", "reasoning", { pricePerUnit: 2, priceCurrency: "USD" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", scriptLength: 10 });
    seedAttempt({ stage: "voice-over", providerId: "voice-b", sentAt: AT, outcome: "success", scriptLength: 10 });
    seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "success" });

    const report = estimatedCostReport(PERIOD);
    expect(report.totals.map((total) => total.currency)).toEqual(["EUR", "USD"]);
    expect(report.totals[0]!.estimatedCost).toBeCloseTo(5, 10);
    expect(report.totals[1]!.estimatedCost).toBeCloseTo(3, 10);
    expect(report.totalsExcludeUnpriced).toBe(false);
  });

  it("bills the same units as the provider-usage report for the same period", async () => {
    profile("voice-a", "voice", { pricePerUnit: 1, priceCurrency: "USD" });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", scriptLength: 31 });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "timed-out", scriptLength: 99 });
    await seedScene({ provider: "img-a", videoProvider: "vid-a" }, [
      { stage: "image", mode: "success" },
      { stage: "video", mode: "not_retryable_failure" },
      { stage: "video", mode: "success" },
    ]);

    const billed = (rows: { stage: string; providerId: string; billedUnits: number }[]) => rows.map((row) => [row.stage, row.providerId, row.billedUnits]);
    expect(billed(estimatedCostReport(PERIOD).rows)).toEqual(billed(providerUsageReport(PERIOD).rows));
  });

  it("has no rows and no totals for an empty period", () => {
    expect(estimatedCostReport(PERIOD)).toEqual({ from: PERIOD.from, to: PERIOD.to, sceneAttemptsFollowCurrentProvider: true, rows: [], totals: [], totalsExcludeUnpriced: false });
  });
});
