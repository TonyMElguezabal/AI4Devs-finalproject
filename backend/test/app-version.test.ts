import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { readBuildConfig } from "../src/config/build.ts";
import { buildApp } from "../src/server.ts";

// show-app-version (JOS-238), tasks 1.1 and 1.2 — the running build's version and channel, and nothing else.
let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

describe("GET /app/version", () => {
  it("returns the build's version and channel and no other field", async () => {
    const response = await app.inject({ method: "GET", url: "/app/version" });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(["channel", "version"]);
    expect(response.json()).toEqual({ version: "0.0.0-dev", channel: "development" });
  });
});

describe("readBuildConfig", () => {
  it("reports 0.0.0-dev on the development channel when nothing was set at build time", () => {
    expect(readBuildConfig({})).toMatchObject({ version: "0.0.0-dev", channel: "development" });
  });

  it.each(["uat", "production"] as const)("keeps the version and the %s channel it was built with", (channel) => {
    expect(readBuildConfig({ VID4YOU_VERSION: "2026.10.28-3d00e7b", VID4YOU_CHANNEL: channel })).toMatchObject({ version: "2026.10.28-3d00e7b", channel });
  });
});
