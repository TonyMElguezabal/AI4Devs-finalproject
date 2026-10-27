import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAll } from "../src/db.ts";
import { providerUsageReport } from "../src/providerUsageReport.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setTelemetryExportersForTest } from "../src/telemetry/index.ts";
import { installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, seedAttempt, seedSceneAttempt } from "./providerUsageFixtures.ts";

// report-provider-usage (JOS-223), task 2.4 — design Decision 6: the report and the telemetry derive the same billed units.

const AT = "2026-10-05T10:00:00.000Z";
const CONSENT = { errors: false, providerUsage: true, productUsage: false, answered: true, installId: "INSTALL1" };

let metrics: InMemoryMetricExporter;

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
  resetTelemetryForTest();
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  setTelemetryExportersForTest({ metrics, logs: new InMemoryLogRecordExporter() });
  setConsent(CONSENT);
});

afterEach(() => {
  removeTwoProvidersPerStage();
  resetTelemetryForTest();
});

/** The `vid4you_billed_units_total` of the latest export (counters are cumulative, so older exports are not added) for the provider. */
async function telemetryUnits(provider: string): Promise<number> {
  await flushTelemetry();
  return metrics
    .getMetrics()
    .slice(-1)
    .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
    .filter((metric) => metric.descriptor.name === "vid4you_billed_units_total")
    .flatMap((metric) => metric.dataPoints.map((point) => ({ attributes: point.attributes, value: point.value as number })))
    .filter((point) => point.attributes.provider === provider)
    .reduce((total, point) => total + point.value, 0);
}

const reportUnits = (provider: string): number => providerUsageReport(PERIOD).rows.find((row) => row.providerId === provider)!.billedUnits;

describe("billed units of the report equal those of the telemetry", () => {
  it("for voice characters", async () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", scriptLength: 31 });
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", scriptLength: 99 });
    expect(await telemetryUnits("voice-a")).toBe(31);
    expect(reportUnits("voice-a")).toBe(31);
  });

  it("for images and clip seconds", async () => {
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 10, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "success", latencyMs: 10, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "transient_failure", latencyMs: 10, sentAt: AT });
    expect(await telemetryUnits("vid-a")).toBeGreaterThan(0);
    expect(reportUnits("img-a")).toBe(await telemetryUnits("img-a"));
    expect(reportUnits("vid-a")).toBe(await telemetryUnits("vid-a"));
  });
});
