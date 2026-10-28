import { randomUUID } from "node:crypto";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  completeStageAttempt,
  createRun,
  db,
  getTelemetrySettings,
  insertProviderRequest,
  recordStageAttempt,
  resetAll,
} from "../src/db.ts";
import { ensureProfiles } from "../src/providerProfiles.ts";
import { SEEDED_PROFILES } from "../src/providerTypes.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setTelemetryExportersForTest } from "../src/telemetry/index.ts";

// add-observability-telemetry (JOS-199), group 4 — Decision 4: the two recording functions feed telemetry, so
// the 13+ callers never have to remember to report.
const SENT = "2026-10-05T10:00:00.000Z";
const FINISHED = "2026-10-05T10:00:04.000Z";
const SCRIPT = "A short script.";

let metrics: InMemoryMetricExporter;
let logs: InMemoryLogRecordExporter;

beforeEach(() => {
  resetAll();
  ensureProfiles(); // report-stable-provider-name (JOS-213): the provider label comes from the stored profile
  resetTelemetryForTest();
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  logs = new InMemoryLogRecordExporter();
  setTelemetryExportersForTest({ metrics, logs });
  setConsent({ ...getTelemetrySettings(), errors: true, providerUsage: true, productUsage: true });
});
afterEach(() => resetTelemetryForTest());

async function points(): Promise<Array<{ name: string; attributes: Record<string, unknown>; value: any }>> {
  await flushTelemetry();
  return metrics.getMetrics().flatMap((rm) =>
    rm.scopeMetrics.flatMap((sm) =>
      sm.metrics.flatMap((m) => m.dataPoints.map((dp) => ({ name: m.descriptor.name, attributes: dp.attributes, value: dp.value }))),
    ),
  );
}

function voiceAttempt() {
  const runId = randomUUID();
  createRun(runId, "telemetry hooks", SCRIPT, "en");
  return recordStageAttempt({ runId, stage: "voice-over", providerId: SEEDED_PROFILES.voice.id, queuedAt: SENT, sentAt: SENT });
}

function sceneWith(videoProvider: string, requestedSeconds: number) {
  const runId = randomUUID();
  createRun(runId, "telemetry hooks", SCRIPT, "en");
  const sceneId = randomUUID();
  db.prepare(
    "INSERT INTO scenes (id, run_id, idx, status, attempts, instruction, provider_mode, provider_latency_ms, updated_at, provider, video_provider, requested_duration_seconds) VALUES (?, ?, 0, 'submitted', 0, '', 'success', 0, ?, ?, ?, ?)",
  ).run(sceneId, runId, SENT, SEEDED_PROFILES.image.id, videoProvider, requestedSeconds);
  return sceneId;
}

describe("completeStageAttempt", () => {
  it("records one call with the provider, the latency and the script length as voice characters", async () => {
    const attempt = voiceAttempt();
    completeStageAttempt(attempt.id, { outcome: "success", finishedAt: FINISHED });
    const recorded = await points();
    expect(recorded).toContainEqual({
      name: "vid4you_provider_calls_total",
      attributes: { stage: "voice-over", provider: "ElevenLabs", outcome: "success" },
      value: 1,
    });
    expect(recorded.find((p) => p.name === "vid4you_provider_call_duration_ms")?.value).toMatchObject({ count: 1, sum: 4000 });
    expect(recorded).toContainEqual({
      name: "vid4you_billed_units_total",
      attributes: { stage: "voice-over", provider: "ElevenLabs", unit: "voice_characters" },
      value: SCRIPT.length,
    });
  });

  it("records nothing for a refused second completion", async () => {
    const attempt = voiceAttempt();
    completeStageAttempt(attempt.id, { outcome: "success", finishedAt: FINISHED });
    expect(completeStageAttempt(attempt.id, { outcome: "success", finishedAt: FINISHED })).toBe(false);
    const calls = (await points()).find((p) => p.name === "vid4you_provider_calls_total");
    expect(calls?.value).toBe(1);
  });

  it("records one error for a not-retryable completion", async () => {
    const attempt = voiceAttempt();
    completeStageAttempt(attempt.id, {
      outcome: "not-retryable",
      finishedAt: FINISHED,
      errorCode: "E_QUOTA",
      errorMessage: "quota exceeded",
    });
    await flushTelemetry();
    const records = logs.getFinishedLogRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.attributes).toMatchObject({
      stage: "voice-over",
      provider: "ElevenLabs",
      "error.code": "E_QUOTA",
      outcome: "not-retryable",
      "exception.message": "quota exceeded",
    });
  });
});

describe("insertProviderRequest", () => {
  it("records a successful clip with the scene's video provider and its requested seconds", async () => {
    const sceneId = sceneWith(SEEDED_PROFILES.video.id, 6);
    insertProviderRequest(randomUUID(), sceneId, 1500, "success", 1, "video");
    const recorded = await points();
    expect(recorded).toContainEqual({
      name: "vid4you_provider_calls_total",
      attributes: { stage: "video", provider: "RunningHub", outcome: "success" },
      value: 1,
    });
    expect(recorded).toContainEqual({
      name: "vid4you_billed_units_total",
      attributes: { stage: "video", provider: "RunningHub", unit: "clip_seconds" },
      value: 6,
    });
  });

  it("records a successful image as one image", async () => {
    const sceneId = sceneWith(SEEDED_PROFILES.video.id, 6);
    insertProviderRequest(randomUUID(), sceneId, 800, "success", 1, "image");
    expect(await points()).toContainEqual({
      name: "vid4you_billed_units_total",
      attributes: { stage: "image", provider: "Fal.ai", unit: "images" },
      value: 1,
    });
  });

  it("records an error for a not_retryable_failure", async () => {
    const sceneId = sceneWith(SEEDED_PROFILES.video.id, 6);
    insertProviderRequest(randomUUID(), sceneId, 0, "not_retryable_failure", 1, "video");
    await flushTelemetry();
    expect(logs.getFinishedLogRecords()[0]?.attributes).toMatchObject({
      stage: "video",
      provider: "RunningHub",
      outcome: "not-retryable",
    });
  });
});
