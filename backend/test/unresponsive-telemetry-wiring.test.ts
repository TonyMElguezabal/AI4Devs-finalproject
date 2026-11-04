import { randomUUID } from "node:crypto";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { commitSceneResult, createRun, getRun, getScenesForRun, getTelemetrySettings, markImageComplete, resetAll, writeArtefactOnce } from "../src/db.ts";
import { resetImageProviderRegistry, setImageProviderRegistry, type ImageProvider } from "../src/imageProvider.ts";
import { launchImageStageForRun, launchVideoStageForRun, resetAssemblyTool, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { setRetryDelayConfig } from "../src/retry/stageAttemptRecorder.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setTelemetryExportersForTest } from "../src/telemetry/index.ts";
import { STAGE } from "../src/types.ts";
import { resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry, type VideoProvider } from "../src/videoProvider.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// alert-unresponsive-provider (JOS-257), design Decision 2 — the adapter's mark travels through the orchestrator and
// the voice-over phase to the provider-call metric, on every path that records an image, clip or voice-over failure.

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

const UNANSWERED = { kind: "failed_transient", reason: "the provider could not be reached", unresponsive: true } as const;

let metrics: InMemoryMetricExporter;

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  setVideoStageStartDelayMs(9_999_999); // the image case keeps the video stage out
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  resetVoiceProviderRegistry();
  resetAssemblyTool();
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
  resetVideoProviderRegistry();
  resetVoiceProviderRegistry();
});

async function outcomesFor(stage: string): Promise<unknown[]> {
  await flushTelemetry();
  // Cumulative temporality: the latest export holds every count so far, and earlier exports repeat them.
  return (metrics.getMetrics().at(-1)?.scopeMetrics ?? [])
    .flatMap((sm) => sm.metrics)
    .filter((m) => m.descriptor.name === "vid4you_provider_calls_total")
    .flatMap((m) => m.dataPoints.map((dp) => dp.attributes))
    .filter((attributes) => attributes.stage === stage)
    .map((attributes) => attributes.outcome);
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function registeredRun(): Promise<{ runId: string; sceneId: string }> {
  const runId = randomUUID();
  createRun(runId, "Unresponsive wiring", "script", "en");
  const fragments: SegmentedFragment[] = [{ text: "script", narrationInterval: { startSeconds: 0, endSeconds: 8 } }];
  const registered = await registerDecomposition(runId, fragments, generator, 8);
  if (!registered.ok) throw new Error("fixture registration failed");
  return { runId, sceneId: getScenesForRun(runId)[0]!.id };
}

async function sceneReadyForVideo(): Promise<string> {
  const { runId, sceneId } = await registeredRun();
  const path = writeArtefactOnce(getRun(runId)!.projectFolder, "scene-0.png", buildPng(1920, 1088));
  commitSceneResult(sceneId, path);
  markImageComplete(sceneId, path);
  return runId;
}

describe("image", () => {
  it("records a submission the provider never answered as unresponsive", async () => {
    const provider: ImageProvider = {
      async submit() {
        return UNANSWERED;
      },
      async poll() {
        return { kind: "check-failed" };
      },
      async cancel() {
        return "unknown";
      },
    };
    setImageProviderRegistry({ defaultIdentifier: "wiring-image", adapters: { "wiring-image": provider } });
    const { runId } = await registeredRun();
    launchImageStageForRun(runId);
    await waitFor(async () => (await outcomesFor("image")).length > 0);
    expect(await outcomesFor("image")).toEqual(["unresponsive"]);
  });
});

describe("video", () => {
  const videoProvider = (overrides: Partial<VideoProvider>): VideoProvider => ({
    async submit() {
      return { kind: "submitted", requestId: randomUUID() }; // a real task id is unique per submission
    },
    async poll() {
      return { kind: "pending" };
    },
    ...overrides,
  });

  it("records a submission the provider never answered as unresponsive", async () => {
    setVideoProviderRegistry({ defaultIdentifier: "wiring-video", adapters: { "wiring-video": videoProvider({ submit: async () => UNANSWERED }) } });
    resetVideoStageStartDelayMs();
    launchVideoStageForRun(await sceneReadyForVideo());
    await waitFor(async () => (await outcomesFor("video")).length > 0);
    expect(await outcomesFor("video")).toEqual(["unresponsive"]);
  });

  it("records a poll the provider never answered as unresponsive", async () => {
    setVideoProviderRegistry({ defaultIdentifier: "wiring-video", adapters: { "wiring-video": videoProvider({ poll: async () => UNANSWERED }) } });
    resetVideoStageStartDelayMs();
    launchVideoStageForRun(await sceneReadyForVideo());
    await waitFor(async () => (await outcomesFor("video")).length > 0);
    expect(await outcomesFor("video")).toEqual(["unresponsive"]);
  });
});

describe("voice-over", () => {
  it("records an attempt the provider never answered as unresponsive", async () => {
    setVoiceProviderRegistry({ defaultIdentifier: "wiring-voice", adapters: { "wiring-voice": { synthesize: async () => UNANSWERED } } });
    const runId = randomUUID();
    createRun(runId, "Unresponsive wiring", "A short script.", "en");
    await generateVoiceOver(runId);
    expect(await outcomesFor("voice-over")).toEqual(["unresponsive"]);
  });
});
