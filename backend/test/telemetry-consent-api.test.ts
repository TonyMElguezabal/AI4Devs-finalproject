import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db, getTelemetrySettings } from "../src/db.ts";
import { buildApp } from "../src/server.ts";
import { getConsent, resetTelemetryForTest, setConsent } from "../src/telemetry/index.ts";

// add-observability-telemetry (JOS-199), group 5 — the consent endpoints.
let app: FastifyInstance;

beforeEach(async () => {
  db.exec("UPDATE telemetry_settings SET errors = 0, provider_usage = 0, product_usage = 0, answered_at = NULL");
  resetTelemetryForTest();
  setConsent(getTelemetrySettings());
  app = await buildApp();
});

describe("GET /telemetry/consent", () => {
  it("returns every signal off and unanswered on first launch", async () => {
    const res = await app.inject({ method: "GET", url: "/telemetry/consent" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ errors: false, providerUsage: false, productUsage: false, answered: false });
  });
});

describe("PUT /telemetry/consent", () => {
  it("saves a valid choice, answers 200 with the saved values and applies it without a restart", async () => {
    const body = { errors: true, providerUsage: true, productUsage: false };
    const res = await app.inject({ method: "PUT", url: "/telemetry/consent", payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...body, answered: true });
    expect(getTelemetrySettings()).toMatchObject({ ...body, answered: true });
    expect(getConsent()).toMatchObject(body);
    expect((await app.inject({ method: "GET", url: "/telemetry/consent" })).json()).toEqual({ ...body, answered: true });
  });

  it.each([
    ["a missing signal", { errors: true, providerUsage: true }],
    ["a non-boolean value", { errors: "yes", providerUsage: true, productUsage: false }],
  ])("rejects %s with 400 and leaves the store unchanged", async (_name, payload) => {
    const res = await app.inject({ method: "PUT", url: "/telemetry/consent", payload });
    expect(res.statusCode).toBe(400);
    expect(getTelemetrySettings()).toMatchObject({ errors: false, providerUsage: false, productUsage: false, answered: false });
  });

  it("never exposes the install ID", async () => {
    const res = await app.inject({ method: "GET", url: "/telemetry/consent" });
    expect(JSON.stringify(res.json())).not.toContain(getTelemetrySettings().installId);
  });
});
