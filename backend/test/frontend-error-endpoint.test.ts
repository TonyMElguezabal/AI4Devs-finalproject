import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTelemetrySettings, resetAll } from "../src/db.ts";
import { resetFrontendErrorLimitForTest } from "../src/routes.ts";
import { buildApp } from "../src/server.ts";
import { createAppLogger } from "../src/telemetry/logFile.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setErrorLog, setTelemetryExportersForTest } from "../src/telemetry/index.ts";

// cover-error-reporting (JOS-254), design D3 — POST /telemetry/frontend-errors: capped by its schema, reported with
// `stage` `frontend`, at most 10 per 60 s, always 204 once valid.

type LoggedError = { fields: Record<string, unknown>; message: string };

let app: FastifyInstance;
let logged: LoggedError[];
let logs: InMemoryLogRecordExporter;
let stdout: string[];
let logDir: string;

beforeEach(async () => {
  resetAll();
  resetTelemetryForTest();
  resetFrontendErrorLimitForTest();
  logs = new InMemoryLogRecordExporter();
  setTelemetryExportersForTest({ metrics: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), logs });
  logged = [];
  setErrorLog({ error: (fields, message) => logged.push({ fields, message }) });
  stdout = [];
  logDir = mkdtempSync(join(tmpdir(), "vid4you-frontend-errors-"));
  app = await buildApp({ logger: createAppLogger({ dir: logDir, stdout: { write: (chunk) => stdout.push(chunk) } }) });
});

afterEach(async () => {
  vi.useRealTimers();
  await app.close();
  rmSync(logDir, { recursive: true, force: true });
  resetTelemetryForTest();
});

const report = (payload: unknown) => app.inject({ method: "POST", url: "/telemetry/frontend-errors", payload: payload as object });
const warnings = () => stdout.map((line) => JSON.parse(line) as { level: number; msg: string }).filter((line) => line.level === 40);

describe("POST /telemetry/frontend-errors", () => {
  it("answers 204 and reports stage frontend with the kind as the error code", async () => {
    const response = await report({ kind: "render", message: "x is undefined", stack: "TypeError: x is undefined\n    at App" });

    expect(response.statusCode).toBe(204);
    expect(logged).toEqual([
      { fields: { stage: "frontend", errorCode: "render", stack: "TypeError: x is undefined\n    at App" }, message: "x is undefined" },
    ]);
  });

  it.each([
    ["a message of 1001 characters", { kind: "error", message: "m".repeat(1001) }],
    ["a stack of 8001 characters", { kind: "error", message: "m", stack: "s".repeat(8001) }],
    ["an unknown kind", { kind: "crash", message: "m" }],
    ["an extra field", { kind: "error", message: "m", script: "the user's script" }],
    ["no message", { kind: "error" }],
  ])("answers 400 and reports nothing for %s", async (_name, payload) => {
    expect((await report(payload)).statusCode).toBe(400);
    expect(logged).toEqual([]);
  });

  it("is behind the origin policy: a report from another web page is refused and not reported", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/telemetry/frontend-errors",
      headers: { origin: "https://evil.example" },
      payload: { kind: "error", message: "m" },
    });

    expect(response.statusCode).toBe(403);
    expect(logged).toEqual([]);
  });

  it("accepts a message of exactly 1000 and a stack of exactly 8000 characters", async () => {
    expect((await report({ kind: "unhandledrejection", message: "m".repeat(1000), stack: "s".repeat(8000) })).statusCode).toBe(204);
  });

  it("writes the local line and exports nothing when error consent is off", async () => {
    setConsent({ ...getTelemetrySettings(), errors: false });

    await report({ kind: "error", message: "boom" });
    await flushTelemetry();

    expect(logged).toHaveLength(1);
    expect(logs.getFinishedLogRecords()).toHaveLength(0);
  });

  it("exports one record with stage frontend when error consent is on", async () => {
    setConsent({ ...getTelemetrySettings(), errors: true });

    await report({ kind: "error", message: "boom" });
    await flushTelemetry();

    const records = logs.getFinishedLogRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.attributes).toMatchObject({ stage: "frontend", "error.code": "error" });
  });
});

describe("the rate limit", () => {
  it("reports 10 per window, answers 204 to the rest, warns once, and reports again in the next window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T10:00:00Z"));

    const answers = [];
    for (let index = 0; index < 50; index++) answers.push((await report({ kind: "error", message: `loop ${index}` })).statusCode);

    expect(answers.every((status) => status === 204)).toBe(true);
    expect(logged).toHaveLength(10);
    expect(warnings().filter((line) => line.msg.includes("frontend error reports"))).toHaveLength(1);

    vi.setSystemTime(new Date("2026-11-04T10:01:00Z"));
    await report({ kind: "error", message: "after the window" });

    expect(logged).toHaveLength(11);
    expect(logged[10]!.message).toBe("after the window");
  });
});
