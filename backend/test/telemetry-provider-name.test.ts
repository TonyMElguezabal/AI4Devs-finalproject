import { randomUUID } from "node:crypto";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LEGACY_IMAGE_PROVIDER_IDENTIFIER, LEGACY_VIDEO_PROVIDER_IDENTIFIER } from "../src/config/providers.ts";
import {
  completeStageAttempt,
  createRun,
  db,
  getTelemetrySettings,
  insertProviderRequest,
  recordStageAttempt,
  resetAll,
} from "../src/db.ts";
import { ensureProfiles, insertProfile } from "../src/providerProfiles.ts";
import { ADAPTER_VENDORS, PARAMETER_SHAPES, SEEDED_PROFILES } from "../src/providerTypes.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setTelemetryExportersForTest } from "../src/telemetry/index.ts";
import { ulid } from "../src/util/ulid.ts";

// report-stable-provider-name (JOS-213) — the `provider` label of every metric and error record is a fixed vendor
// name, never the identifier the attempt or the scene stored.
const SENT = "2026-10-05T10:00:00.000Z";
const FINISHED = "2026-10-05T10:00:04.000Z";

let metrics: InMemoryMetricExporter;
let logs: InMemoryLogRecordExporter;

beforeEach(() => {
  resetAll();
  ensureProfiles();
  resetTelemetryForTest();
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  logs = new InMemoryLogRecordExporter();
  setTelemetryExportersForTest({ metrics, logs });
  setConsent({ ...getTelemetrySettings(), errors: true, providerUsage: true, productUsage: true });
});
afterEach(() => resetTelemetryForTest());

async function callAttributes(): Promise<Array<Record<string, unknown>>> {
  await flushTelemetry();
  return metrics
    .getMetrics()
    .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics.filter((m) => m.descriptor.name === "vid4you_provider_calls_total")))
    .flatMap((m) => m.dataPoints.map((dp) => dp.attributes));
}

async function everyExportedAttribute(): Promise<string> {
  await flushTelemetry();
  const metricAttributes = metrics.getMetrics().flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics.flatMap((m) => m.dataPoints.map((dp) => dp.attributes))));
  const logAttributes = logs.getFinishedLogRecords().map((r) => r.attributes);
  return JSON.stringify([...metricAttributes, ...logAttributes]);
}

/** Records and completes one stage attempt with the stored identifier, and returns the `provider` label it exported. */
async function attemptProvider(stage: "voice-over" | "timestamps" | "decomposition" | "assembly", providerId: string | null): Promise<unknown> {
  const runId = randomUUID();
  createRun(runId, "provider name", "A short script.", "en");
  const attempt = recordStageAttempt({ runId, stage, providerId, queuedAt: SENT, sentAt: SENT });
  completeStageAttempt(attempt.id, { outcome: "success", finishedAt: FINISHED });
  const [call] = await callAttributes();
  return call?.provider;
}

function scene(provider: string | null, videoProvider: string | null): string {
  const runId = randomUUID();
  createRun(runId, "provider name", "A short script.", "en");
  const sceneId = randomUUID();
  db.prepare(
    "INSERT INTO scenes (id, run_id, idx, status, attempts, instruction, provider_mode, provider_latency_ms, updated_at, provider, video_provider, requested_duration_seconds) VALUES (?, ?, 0, 'submitted', 0, '', 'success', 0, ?, ?, ?, 6)",
  ).run(sceneId, runId, SENT, provider, videoProvider);
  return sceneId;
}

describe("ADAPTER_VENDORS", () => {
  it("names the vendor of every adapter type and nothing else", () => {
    expect(ADAPTER_VENDORS).toEqual({
      "openai-reasoning": "OpenAI",
      "elevenlabs-voice": "ElevenLabs",
      "elevenlabs-alignment": "ElevenLabs",
      "fal-image": "Fal.ai",
      "runninghub-video": "RunningHub",
    });
    expect(Object.keys(ADAPTER_VENDORS).sort()).toEqual(Object.keys(PARAMETER_SHAPES).sort());
  });
});

describe("the provider label of a stage attempt", () => {
  it("is the vendor of each seeded provider (AC1)", async () => {
    expect(await attemptProvider("decomposition", SEEDED_PROFILES.reasoning.id)).toBe("OpenAI");
  });

  it("is the same ElevenLabs for voice-over and for timestamps, apart by stage (AC2)", async () => {
    const runId = randomUUID();
    createRun(runId, "provider name", "A short script.", "en");
    const voice = recordStageAttempt({ runId, stage: "voice-over", providerId: SEEDED_PROFILES.voice.id, queuedAt: SENT, sentAt: SENT });
    const native = recordStageAttempt({ runId, stage: "timestamps", providerId: "elevenlabs-native", queuedAt: SENT, sentAt: SENT });
    const aligned = recordStageAttempt({ runId, stage: "timestamps", providerId: SEEDED_PROFILES.alignment.id, queuedAt: SENT, sentAt: SENT });
    for (const attempt of [voice, native, aligned]) completeStageAttempt(attempt.id, { outcome: "success", finishedAt: FINISHED });

    const calls = await callAttributes();
    expect(calls).toHaveLength(2);
    expect(calls).toContainEqual({ stage: "voice-over", provider: "ElevenLabs", outcome: "success" });
    expect(calls).toContainEqual({ stage: "timestamps", provider: "ElevenLabs", outcome: "success" });
  });

  it("is local for the assembly stage, which calls no provider", async () => {
    expect(await attemptProvider("assembly", null)).toBe("local");
  });

  it("is stub for a stub identifier", async () => {
    expect(await attemptProvider("voice-over", "stub-voice")).toBe("stub");
  });

  it("is the vendor, not the id or the typed label, for a provider added on /admin", async () => {
    const id = ulid();
    insertProfile({ id, stage: "voice", adapterType: "elevenlabs-voice", label: "My voice account", parameters: {} }, SENT);
    expect(await attemptProvider("voice-over", id)).toBe("ElevenLabs");
    const exported = await everyExportedAttribute();
    expect(exported).not.toContain(id);
    expect(exported).not.toContain("My voice account");
  });

  it("is unknown for an identifier nothing maps, and the identifier is not exported (AC3)", async () => {
    expect(await attemptProvider("decomposition", "some-old-model-id")).toBe("unknown");
    expect(await everyExportedAttribute()).not.toContain("some-old-model-id");
    expect(await attemptProvider("voice-over", null)).toBe("unknown");
  });

  it("is the same vendor on the error record", async () => {
    const runId = randomUUID();
    createRun(runId, "provider name", "A short script.", "en");
    const attempt = recordStageAttempt({ runId, stage: "voice-over", providerId: SEEDED_PROFILES.voice.id, queuedAt: SENT, sentAt: SENT });
    completeStageAttempt(attempt.id, { outcome: "not-retryable", finishedAt: FINISHED, errorCode: "E_QUOTA", errorMessage: "quota exceeded" });
    await flushTelemetry();
    expect(logs.getFinishedLogRecords()[0]?.attributes).toMatchObject({ stage: "voice-over", provider: "ElevenLabs" });
  });
});

describe("the provider label of an image or clip request", () => {
  it("is the vendor of each seeded provider (AC1)", async () => {
    insertProviderRequest(randomUUID(), scene(SEEDED_PROFILES.image.id, SEEDED_PROFILES.video.id), 100, "success", 1, "image");
    insertProviderRequest(randomUUID(), scene(SEEDED_PROFILES.image.id, SEEDED_PROFILES.video.id), 100, "success", 1, "video");
    const calls = await callAttributes();
    expect(calls).toContainEqual({ stage: "image", provider: "Fal.ai", outcome: "success" });
    expect(calls).toContainEqual({ stage: "video", provider: "RunningHub", outcome: "success" });
  });

  it("resolves the legacy identifiers to their vendor and exports neither the model nor the path", async () => {
    insertProviderRequest(randomUUID(), scene(LEGACY_IMAGE_PROVIDER_IDENTIFIER, LEGACY_VIDEO_PROVIDER_IDENTIFIER), 100, "success", 1, "image");
    insertProviderRequest(randomUUID(), scene(LEGACY_IMAGE_PROVIDER_IDENTIFIER, LEGACY_VIDEO_PROVIDER_IDENTIFIER), 100, "success", 1, "video");
    const calls = await callAttributes();
    expect(calls).toContainEqual({ stage: "image", provider: "Fal.ai", outcome: "success" });
    expect(calls).toContainEqual({ stage: "video", provider: "RunningHub", outcome: "success" });
    const exported = await everyExportedAttribute();
    expect(exported).not.toContain("flux");
    expect(exported).not.toContain("/openapi");
  });

  it("is the vendor, not the id or the typed label, for an image provider added on /admin", async () => {
    const id = ulid();
    insertProfile({ id, stage: "image", adapterType: "fal-image", label: "My image account", parameters: { model: "fal-ai/other" } }, SENT);
    insertProviderRequest(randomUUID(), scene(id, SEEDED_PROFILES.video.id), 100, "success", 1, "image");
    expect(await callAttributes()).toContainEqual({ stage: "image", provider: "Fal.ai", outcome: "success" });
    const exported = await everyExportedAttribute();
    expect(exported).not.toContain(id);
    expect(exported).not.toContain("My image account");
  });

  it("is stub for the stub providers and unknown when no identifier was stored", async () => {
    insertProviderRequest(randomUUID(), scene("stub-image-provider", "stub-video-provider"), 100, "success", 1, "image");
    insertProviderRequest(randomUUID(), scene("stub-image-provider", null), 100, "success", 1, "video");
    const providers = (await callAttributes()).map((a) => `${String(a.stage)}:${String(a.provider)}`).sort();
    expect(providers).toEqual(["image:stub", "video:unknown"]);
  });

  it("is the vendor on the error record of a clip that failed for good", async () => {
    insertProviderRequest(randomUUID(), scene(SEEDED_PROFILES.image.id, SEEDED_PROFILES.video.id), 0, "not_retryable_failure", 1, "video");
    await flushTelemetry();
    expect(logs.getFinishedLogRecords()[0]?.attributes).toMatchObject({ stage: "video", provider: "RunningHub", outcome: "not-retryable" });
  });
});
