import { randomUUID } from "node:crypto";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { createRun, getScenesForRun, getTelemetrySettings, resetAll } from "../src/db.ts";
import { createFalAiImageProvider, resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { launchImageStageForRun, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { setRetryDelayConfig } from "../src/retry/stageAttemptRecorder.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setTelemetryExportersForTest } from "../src/telemetry/index.ts";
import { STAGE } from "../src/types.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { createElevenLabsVoiceProvider, resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// alert-unresponsive-provider (JOS-259), design Decision 6 — the real fal and ElevenLabs adapters, the real
// orchestrator and store, and the telemetry module up to the exporter: a provider that never answers reaches the
// exported metric as `unresponsive`, one that answers 503 as `transient`. The relay and Grafana are covered by the
// live check (tasks group 9); a timed-out attempt by the `timeOutAttempt` tests in telemetry-hooks.test.ts.

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

/** A provider that never answers: the request only ends when the adapter's own time limit aborts it. */
const neverAnswers = ((_url: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof fetch;
const answers503 = (async () => new Response("busy", { status: 503 })) as typeof fetch;

let metrics: InMemoryMetricExporter;

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  setVideoStageStartDelayMs(9_999_999);
  resetImageProviderRegistry();
  resetVoiceProviderRegistry();
  setRetryDelayConfig({ baseSeconds: 3600, capSeconds: 3600 }); // retries stay scheduled, so each case records once
  resetTelemetryForTest();
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  setTelemetryExportersForTest({ metrics, logs: new InMemoryLogRecordExporter() });
  setConsent({ ...getTelemetrySettings(), providerUsage: true });
});

afterEach(() => {
  resetTelemetryForTest();
  resetVideoStageStartDelayMs();
  resetImageProviderRegistry();
  resetVoiceProviderRegistry();
});

async function exportedOutcomes(stage: string): Promise<unknown[]> {
  await flushTelemetry();
  // Cumulative temporality: the latest export holds every count so far, and earlier exports repeat them.
  return (metrics.getMetrics().at(-1)?.scopeMetrics ?? [])
    .flatMap((sm) => sm.metrics)
    .filter((m) => m.descriptor.name === "vid4you_provider_calls_total")
    .flatMap((m) => m.dataPoints.map((dp) => dp.attributes))
    .filter((attributes) => attributes.stage === stage)
    .map((attributes) => attributes.outcome);
}

async function imageOutcomeWith(fetchFn: typeof fetch): Promise<unknown[]> {
  const adapter = createFalAiImageProvider({ fetchFn, loadKey: () => "test-key", callTimeoutMs: 50, parameters: { model: "fal-ai/test" } });
  setImageProviderRegistry({ defaultIdentifier: "contract-image", adapters: { "contract-image": adapter } });
  const runId = randomUUID();
  createRun(runId, "Unresponsive contract", "script", "en");
  const fragments: SegmentedFragment[] = [{ text: "script", narrationInterval: { startSeconds: 0, endSeconds: 8 } }];
  if (!(await registerDecomposition(runId, fragments, generator, 8)).ok) throw new Error("fixture registration failed");
  expect(getScenesForRun(runId)).toHaveLength(1);
  launchImageStageForRun(runId);
  const start = Date.now();
  while ((await exportedOutcomes("image")).length === 0) {
    if (Date.now() - start > 5000) throw new Error("no image call was exported");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return exportedOutcomes("image");
}

async function voiceOutcomeWith(fetchFn: typeof fetch): Promise<unknown[]> {
  setVoiceProviderRegistry({
    defaultIdentifier: "contract-voice",
    adapters: { "contract-voice": createElevenLabsVoiceProvider({ fetchFn, loadKey: () => "test-key", timeoutMs: 50 }) },
  });
  const runId = randomUUID();
  createRun(runId, "Unresponsive contract", "A short script.", "en");
  await generateVoiceOver(runId);
  return exportedOutcomes("voice-over");
}

describe("image: real fal adapter → orchestrator → store → exporter", () => {
  it("exports a request the provider never answered as unresponsive", async () => {
    expect(await imageOutcomeWith(neverAnswers)).toEqual(["unresponsive"]);
  });

  it("exports a 503 answer as transient", async () => {
    expect(await imageOutcomeWith(answers503)).toEqual(["transient"]);
  });
});

describe("voice-over: real ElevenLabs adapter → voice-over phase → store → exporter", () => {
  it("exports a request the provider never answered as unresponsive", async () => {
    expect(await voiceOutcomeWith(neverAnswers)).toEqual(["unresponsive"]);
  });

  it("exports a 503 answer as transient", async () => {
    expect(await voiceOutcomeWith(answers503)).toEqual(["transient"]);
  });
});
