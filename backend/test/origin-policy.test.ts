import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server.ts";

// Checkpoint 2 security finding: the API has no authentication, so a web page the user visits must not be
// able to call it. Only the app's own origins may; requests without an Origin header (curl, the app itself) are untouched.

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

const get = (origin?: string, path = "/health") =>
  app.inject({ method: "GET", url: path, headers: origin ? { origin } : {} });

describe("origin policy", () => {
  it.each(["http://127.0.0.1:5173", "http://localhost:5173"])("lets the dev frontend %s read the API", async (origin) => {
    const response = await get(origin);
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("lets the packaged app's own origin through", async () => {
    const response = await get("http://127.0.0.1:3100");
    expect(response.statusCode).toBe(200);
  });

  it("serves a request with no Origin header (curl, same-origin page loads)", async () => {
    expect((await get()).statusCode).toBe(200);
  });

  it.each(["https://evil.example", "http://127.0.0.1:9999", "http://localhost.evil.example", "null"])(
    "refuses a web page at %s with 403 and no CORS header",
    async (origin) => {
      const response = await get(origin);
      expect(response.statusCode).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    },
  );

  it("refuses a state-changing request from a foreign page before it runs (no preflight is needed for an empty POST)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV/voice-over/retry",
      headers: { origin: "https://evil.example" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("answers a preflight from a foreign page with 403", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/sessions",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("does not echo a foreign origin on the live-update stream", async () => {
    const response = await app.inject({ method: "GET", url: "/events", headers: { origin: "https://evil.example" } });
    expect(response.statusCode).toBe(403);
  });
});

describe("host policy", () => {
  it("refuses a request whose Host is not loopback (DNS rebinding)", async () => {
    const response = await app.inject({ method: "GET", url: "/health", headers: { host: "evil.example:3100" } });
    expect(response.statusCode).toBe(403);
  });
});
