import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_ATTRIBUTE_KEYS } from "../../infra/telemetry-relay/src/allowlist.ts";
import { getTelemetrySettings, resetAll } from "../src/db.ts";
import { buildApp } from "../src/server.ts";
import { flushTelemetry, resetTelemetryForTest, setConsent, setErrorLog, setTelemetryExportersForTest } from "../src/telemetry/index.ts";

// cover-error-reporting (JOS-252), design D1 — a route error answered 5xx is reported with `stage` `api` and the route
// pattern in `route`; a 4xx is not; the answer itself is the one Fastify gave before.

type LoggedError = { fields: Record<string, unknown>; message: string };

const SCRIPT = "Once upon a time a secret script line";

let app: FastifyInstance;
let logged: LoggedError[];
let logs: InMemoryLogRecordExporter;

beforeEach(async () => {
  resetAll();
  resetTelemetryForTest();
  logs = new InMemoryLogRecordExporter();
  setTelemetryExportersForTest({ metrics: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), logs });
  logged = [];
  setErrorLog({ error: (fields, message) => logged.push({ fields, message }) });
  app = await buildApp();
  app.post("/test-only/:id/crash", async () => {
    throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
  });
  app.get("/test-only/unavailable", async () => {
    throw Object.assign(new Error("upstream down"), { statusCode: 503 });
  });
  app.get("/test-only/plain", async () => {
    throw new TypeError("x is undefined");
  });
});

afterEach(async () => {
  await app.close();
  resetTelemetryForTest();
});

describe("5xx route errors", () => {
  it("answers 500 with Fastify's body and reports stage api, the route pattern and the error code", async () => {
    const response = await app.inject({ method: "POST", url: "/test-only/abc123/crash?x=1", payload: { script: SCRIPT } });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ statusCode: 500, code: "SQLITE_BUSY", error: "Internal Server Error", message: "database is locked" });
    expect(logged).toHaveLength(1);
    expect(logged[0]!.fields).toMatchObject({ stage: "api", route: "POST /test-only/:id/crash", errorCode: "SQLITE_BUSY" });
    expect(logged[0]!.message).toBe("database is locked");
  });

  it("falls back to the error name when there is no code", async () => {
    await app.inject({ method: "GET", url: "/test-only/plain" });

    expect(logged[0]!.fields).toMatchObject({ stage: "api", errorCode: "TypeError" });
  });

  it("reports an error that carries its own 5xx status", async () => {
    const response = await app.inject({ method: "GET", url: "/test-only/unavailable" });

    expect(response.statusCode).toBe(503);
    expect(logged).toHaveLength(1);
  });

  it("never carries the request body, the raw URL or the query", async () => {
    await app.inject({ method: "POST", url: "/test-only/abc123/crash?x=1", payload: { script: SCRIPT } });

    const everything = JSON.stringify(logged);
    expect(everything).not.toContain("secret script");
    expect(everything).not.toContain("abc123");
    expect(everything).not.toContain("x=1");
  });
});

describe("4xx answers", () => {
  it("does not report a validation error", async () => {
    const response = await app.inject({ method: "POST", url: "/sessions", payload: { title: 1 } });

    expect(response.statusCode).toBe(400);
    expect(logged).toEqual([]);
  });

  it("does not report a 401 on an admin route", async () => {
    const response = await app.inject({ method: "GET", url: "/admin/failed-stages" });

    expect(response.statusCode).toBe(401);
    expect(logged).toEqual([]);
  });
});

describe("OTLP export", () => {
  it("exports one record with stage api and only allowlisted keys when error consent is on", async () => {
    setConsent({ ...getTelemetrySettings(), errors: true });

    await app.inject({ method: "POST", url: "/test-only/abc123/crash" });
    await flushTelemetry();

    const records = logs.getFinishedLogRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.attributes.stage).toBe("api");
    expect(records[0]!.attributes.route).toBe("POST /test-only/:id/crash");
    expect(records[0]!.attributes["error.code"]).toBe("SQLITE_BUSY");
    expect(Object.keys(records[0]!.attributes).filter((key) => !ALLOWED_ATTRIBUTE_KEYS.includes(key))).toEqual([]);
  });
});
