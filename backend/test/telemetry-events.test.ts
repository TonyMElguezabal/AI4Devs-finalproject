import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRun, getTelemetrySettings, resetAll, saveTelemetryConsent, setFinalVideoPath } from "../src/db.ts";
import { buildApp, initTelemetry } from "../src/server.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setTelemetryExportersForTest } from "../src/telemetry/index.ts";
import { installProcessErrorHandlers } from "../src/telemetry/processHandlers.ts";

// add-observability-telemetry (JOS-199), group 4 — product events and process-level errors.
let metrics: InMemoryMetricExporter;
let logs: InMemoryLogRecordExporter;

beforeEach(() => {
  resetAll();
  resetTelemetryForTest();
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  logs = new InMemoryLogRecordExporter();
  setTelemetryExportersForTest({ metrics, logs });
});
afterEach(() => {
  resetTelemetryForTest();
  saveTelemetryConsent({ errors: false, providerUsage: false, productUsage: false });
});

async function counter(name: string): Promise<number | undefined> {
  await flushTelemetry();
  const point = metrics
    .getMetrics()
    .flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics))
    .find((m) => m.descriptor.name === name)?.dataPoints[0];
  return point?.value as number | undefined;
}

describe("product events", () => {
  it("counts the application start once at boot, using the stored consent", async () => {
    saveTelemetryConsent({ errors: false, providerUsage: false, productUsage: true });
    initTelemetry();
    expect(await counter("vid4you_app_starts_total")).toBe(1);
  });

  it("counts nothing at boot while the consent is off", async () => {
    initTelemetry();
    expect(await counter("vid4you_app_starts_total")).toBeUndefined();
  });

  it("counts a created session", async () => {
    setConsent({ ...getTelemetrySettings(), productUsage: true });
    const app = await buildApp();
    await app.inject({ method: "POST", url: "/sessions", payload: { title: "T", script: "A script.", language: "en" } });
    expect(await counter("vid4you_sessions_started_total")).toBe(1);
  });

  it("counts a session reaching final-video once, even if the path is set again", async () => {
    setConsent({ ...getTelemetrySettings(), productUsage: true });
    const runId = randomUUID();
    createRun(runId, "T", "A script.", "en");
    setFinalVideoPath(runId, "final-video.mp4");
    setFinalVideoPath(runId, "final-video.mp4");
    expect(await counter("vid4you_final_videos_total")).toBe(1);
  });
});

describe("process-level errors", () => {
  function fakeProcess() {
    const proc = new EventEmitter();
    const exits: number[] = [];
    installProcessErrorHandlers(proc as never, (code) => exits.push(code), () => {});
    return { proc, exits };
  }

  it.each(["uncaughtException", "unhandledRejection"])("reports %s as an error and still exits with 1", async (event) => {
    setConsent({ ...getTelemetrySettings(), errors: true });
    const { proc, exits } = fakeProcess();
    proc.emit(event, new Error("boom at /Users/ana/x.mp4"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await flushTelemetry();
    expect(logs.getFinishedLogRecords()[0]?.attributes["exception.message"]).toBe("boom at [path]");
    expect(exits).toEqual([1]);
  });

  it("still exits with 1 when errors are off", async () => {
    const { proc, exits } = fakeProcess();
    proc.emit("uncaughtException", new Error("boom"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(logs.getFinishedLogRecords()).toEqual([]);
    expect(exits).toEqual([1]);
  });
});
