import { randomUUID } from "node:crypto";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRun, db, getTelemetrySettings, insertProviderRequest, resetAll } from "../src/db.ts";
import { ensureProfiles } from "../src/providerProfiles.ts";
import { flushTelemetry, recordCaughtError, recordError, resetTelemetryForTest, setConsent, setErrorLog, setTelemetryExportersForTest } from "../src/telemetry/index.ts";

// verify-internal-workflow (JOS-243), design D5 — every error given to `recordError` is also written to the local log at
// `error` level, whatever the consent; what is exported over OTLP, and when, is unchanged.

type LoggedError = { fields: Record<string, unknown>; message: string };

let logs: InMemoryLogRecordExporter;
let logged: LoggedError[];

beforeEach(() => {
  resetAll();
  ensureProfiles();
  resetTelemetryForTest();
  logs = new InMemoryLogRecordExporter();
  setTelemetryExportersForTest({ metrics: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), logs });
  logged = [];
  setErrorLog({ error: (fields, message) => logged.push({ fields, message }) });
});

afterEach(() => resetTelemetryForTest());

async function exportedErrorRecords(): Promise<number> {
  await flushTelemetry();
  return logs.getFinishedLogRecords().length;
}

describe("recordError and the local log", () => {
  it("writes one error line with the record's fields and the path-redacted message when error consent is off", async () => {
    setConsent({ ...getTelemetrySettings(), errors: false });

    recordError({ stage: "video", provider: "RunningHub", errorCode: "E42", outcome: "not-retryable", message: "boom at /Users/ana/x.mp4" });

    expect(logged).toHaveLength(1);
    expect(logged[0]!.fields).toEqual({ stage: "video", provider: "RunningHub", errorCode: "E42", outcome: "not-retryable" });
    expect(logged[0]!.message).toContain("boom at");
    expect(logged[0]!.message).not.toContain("/Users/ana");
    expect(await exportedErrorRecords()).toBe(0);
  });

  it("writes the line and exports one OTLP record, as before, when error consent is on", async () => {
    setConsent({ ...getTelemetrySettings(), errors: true });

    recordError({ stage: "voice-over", message: "boom" });

    expect(logged).toEqual([{ fields: { stage: "voice-over" }, message: "boom" }]);
    expect(await exportedErrorRecords()).toBe(1);
  });

  it("carries the redacted stack of an uncaught error", () => {
    recordError({ errorCode: "TypeError", message: "bad", stack: "TypeError: bad\n    at /Users/ana/app/x.ts:1:1" });

    expect(logged[0]!.fields.errorCode).toBe("TypeError");
    expect(String(logged[0]!.fields.stack)).toContain("TypeError: bad");
    expect(String(logged[0]!.fields.stack)).not.toContain("/Users/ana");
  });

  it("writes nothing and behaves as before when no log is set", async () => {
    resetTelemetryForTest();
    setTelemetryExportersForTest({ metrics: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), logs });
    setConsent({ ...getTelemetrySettings(), errors: true });

    recordError({ stage: "image", message: "boom" });

    expect(logged).toEqual([]);
    expect(await exportedErrorRecords()).toBe(1);
  });

  it("never throws when the log itself fails", () => {
    setErrorLog({
      error: () => {
        throw new Error("disk full");
      },
    });

    expect(() => recordError({ stage: "image", message: "boom" })).not.toThrow();
  });
});

describe("a permanent stage failure reaches the local log", () => {
  it("writes an error line for the image stage when an image request fails as not retryable, with consent off", () => {
    setConsent({ ...getTelemetrySettings(), errors: false });
    const runId = randomUUID();
    createRun(runId, "error log", "A short script.", "en");
    const sceneId = randomUUID();
    db.prepare(
      "INSERT INTO scenes (id, run_id, idx, status, attempts, instruction, provider_mode, provider_latency_ms, updated_at, provider) VALUES (?, ?, 0, 'submitted', 0, '', 'success', 0, ?, 'stub-image-provider')",
    ).run(sceneId, runId, "2026-11-03T10:00:00.000Z");

    insertProviderRequest(randomUUID(), sceneId, 100, "not_retryable_failure", 1, "image");

    expect(logged).toHaveLength(1);
    expect(logged[0]!.fields).toMatchObject({ stage: "image", provider: "stub", outcome: "not-retryable" });
  });
});

// cover-error-reporting (JOS-253), design D2 — what a catch block calls for an error no other path reports.
describe("recordCaughtError", () => {
  it("writes the error's name as its code, its message and its stack, with the given stage", () => {
    const error = new RangeError("index out of range");

    recordCaughtError(error, { stage: "video" });

    expect(logged).toHaveLength(1);
    expect(logged[0]!.fields).toMatchObject({ stage: "video", errorCode: "RangeError" });
    expect(String(logged[0]!.fields.stack)).toContain("RangeError: index out of range");
    expect(logged[0]!.message).toBe("index out of range");
  });

  it("turns a thrown value that is not an Error into one", () => {
    recordCaughtError("plain string");

    expect(logged[0]).toMatchObject({ fields: { errorCode: "Error" }, message: "plain string" });
  });
});
