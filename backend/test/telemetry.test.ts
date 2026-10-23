import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_ATTRIBUTE_KEYS } from "../../infra/telemetry-relay/src/allowlist.ts";
import {
  flushTelemetry,
  normalizeOutcome,
  recordError,
  recordProductEvent,
  recordProviderCall,
  resetTelemetryForTest,
  setConsent,
  setTelemetryExportersForTest,
  setTelemetryLogger,
} from "../src/telemetry/index.ts";
import { PROVIDER_OUTCOME_MODES, STAGE_ATTEMPT_OUTCOMES } from "../src/types.ts";

// add-observability-telemetry (JOS-199), group 3 — Decisions 1, 2, 3, 4 and 13: one module is the only door,
// every record function checks its consent flag first, and nothing outside the allowlist is exported.
const ALL_OFF = { errors: false, providerUsage: false, productUsage: false, answered: true, installId: "INSTALL1" };
const ALL_ON = { ...ALL_OFF, errors: true, providerUsage: true, productUsage: true };

let metrics: InMemoryMetricExporter;
let logs: InMemoryLogRecordExporter;

beforeEach(() => {
  resetTelemetryForTest();
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  logs = new InMemoryLogRecordExporter();
  setTelemetryExportersForTest({ metrics, logs });
  setConsent(ALL_OFF);
});
afterEach(() => resetTelemetryForTest());

type Point = { name: string; attributes: Record<string, unknown>; value: unknown };

async function exportedPoints(): Promise<Point[]> {
  await flushTelemetry();
  return metrics.getMetrics().flatMap((rm) =>
    rm.scopeMetrics.flatMap((sm) =>
      sm.metrics.flatMap((m) =>
        m.dataPoints.map((dp) => ({ name: m.descriptor.name, attributes: dp.attributes, value: dp.value })),
      ),
    ),
  );
}

async function exportedResource(): Promise<Record<string, unknown>> {
  await flushTelemetry();
  const first = metrics.getMetrics()[0];
  return first ? first.resource.attributes : {};
}

const voiceCall = { stage: "voice-over", provider: "elevenlabs", outcome: "success", latencyMs: 4200 };

describe("consent gates every record function", () => {
  it("records nothing when every flag is off", async () => {
    recordProviderCall({ ...voiceCall, billed: { unit: "voice_characters", amount: 100 } });
    recordError({ stage: "voice-over", message: "boom" });
    recordProductEvent("app_start");
    expect(await exportedPoints()).toEqual([]);
    expect(logs.getFinishedLogRecords()).toEqual([]);
  });

  it("records a provider call, its latency and its billed units when providerUsage is on", async () => {
    setConsent({ ...ALL_OFF, providerUsage: true });
    recordProviderCall({ ...voiceCall, billed: { unit: "voice_characters", amount: 100 } });
    const points = await exportedPoints();
    const attrs = { stage: "voice-over", provider: "elevenlabs" };
    expect(points).toContainEqual({
      name: "vid4you_provider_calls_total",
      attributes: { ...attrs, outcome: "success" },
      value: 1,
    });
    expect(points).toContainEqual({
      name: "vid4you_billed_units_total",
      attributes: { ...attrs, unit: "voice_characters" },
      value: 100,
    });
    const latency = points.find((p) => p.name === "vid4you_provider_call_duration_ms");
    expect(latency?.value).toMatchObject({ count: 1, sum: 4200 });
  });

  it("counts billed units on success only", async () => {
    setConsent({ ...ALL_OFF, providerUsage: true });
    recordProviderCall({ ...voiceCall, outcome: "transient", billed: { unit: "voice_characters", amount: 100 } });
    const names = (await exportedPoints()).map((p) => p.name);
    expect(names).toContain("vid4you_provider_calls_total");
    expect(names).not.toContain("vid4you_billed_units_total");
  });

  it("records an error log record when errors is on", async () => {
    setConsent({ ...ALL_OFF, errors: true });
    recordError({ stage: "video", provider: "runninghub", errorCode: "E42", outcome: "not-retryable", message: "boom at /Users/ana/x.mp4" });
    await flushTelemetry();
    const [record] = logs.getFinishedLogRecords();
    expect(record?.severityText).toBe("ERROR");
    expect(record?.attributes).toMatchObject({ stage: "video", provider: "runninghub", "error.code": "E42", outcome: "not-retryable" });
    expect(record?.attributes["exception.message"]).toBe("boom at [path]");
  });

  it("counts product events when productUsage is on", async () => {
    setConsent({ ...ALL_OFF, productUsage: true });
    recordProductEvent("app_start");
    recordProductEvent("session_started");
    recordProductEvent("final_video");
    const names = (await exportedPoints()).map((p) => p.name).sort();
    expect(names).toEqual(["vid4you_app_starts_total", "vid4you_final_videos_total", "vid4you_sessions_started_total"]);
  });

  it("applies a consent change without a restart", async () => {
    setConsent({ ...ALL_OFF, providerUsage: true });
    recordProviderCall(voiceCall);
    setConsent(ALL_OFF);
    recordProviderCall(voiceCall);
    const calls = (await exportedPoints()).find((p) => p.name === "vid4you_provider_calls_total");
    expect(calls?.value).toBe(1);
  });
});

describe("what is exported", () => {
  it("carries the documented resource attributes", async () => {
    setConsent({ ...ALL_OFF, productUsage: true });
    recordProductEvent("app_start");
    const resource = await exportedResource();
    expect(resource).toMatchObject({
      "service.name": "vid4you",
      "service.version": "0.0.0-dev",
      "deployment.environment": "development",
      "service.instance.id": "INSTALL1",
    });
    expect(resource["os.type"]).toBeTypeOf("string");
    expect(resource["host.arch"]).toBe(process.arch);
  });

  it("uses only allowlisted attribute keys", async () => {
    setConsent(ALL_ON);
    recordProviderCall({ ...voiceCall, billed: { unit: "voice_characters", amount: 5 } });
    recordProductEvent("app_start");
    recordError({ stage: "video", provider: "p", errorCode: "c", outcome: "not-retryable", message: "m", stack: "s" });
    const points = await exportedPoints();
    const keys = new Set([
      ...Object.keys(await exportedResource()),
      ...points.flatMap((p) => Object.keys(p.attributes)),
      ...logs.getFinishedLogRecords().flatMap((r) => [...Object.keys(r.attributes), ...Object.keys(r.resource.attributes)]),
    ]);
    expect([...keys].filter((key) => !ALLOWED_ATTRIBUTE_KEYS.includes(key))).toEqual([]);
  });
});

describe("normalizeOutcome", () => {
  const expected: Record<string, string> = {
    success: "success",
    "late-success": "success",
    transient: "transient",
    transient_failure: "transient",
    "timed-out": "transient",
    "not-retryable": "not-retryable",
    not_retryable_failure: "not-retryable",
  };

  it.each([...STAGE_ATTEMPT_OUTCOMES, ...PROVIDER_OUTCOME_MODES])("maps %s to a documented value", (raw) => {
    expect(normalizeOutcome(raw)).toBe(expected[raw] ?? "other");
  });
});

describe("telemetry never disturbs the application", () => {
  const failingExporter = {
    export: (_items: unknown, done: (result: { code: number }) => void) => done({ code: 1 }),
    forceFlush: async () => {},
    shutdown: async () => {},
    selectAggregationTemporality: () => AggregationTemporality.CUMULATIVE,
  };

  it("never throws into the caller and logs at most once per minute when export fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const warnings: string[] = [];
      setTelemetryLogger((message) => warnings.push(message));
      setTelemetryExportersForTest({ metrics: failingExporter, logs: logs });
      setConsent({ ...ALL_OFF, providerUsage: true });

      expect(() => recordProviderCall(voiceCall)).not.toThrow();
      await flushTelemetry();
      await flushTelemetry();
      expect(warnings).toHaveLength(1);

      vi.setSystemTime(Date.now() + 61_000);
      recordProviderCall(voiceCall);
      await flushTelemetry();
      expect(warnings).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
