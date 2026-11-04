import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server.ts";
import { resetTelemetryForTest, setErrorLog } from "../src/telemetry/index.ts";

// cover-error-reporting, design D4 — two routes that fail on purpose, registered only with VID4YOU_ERROR_TRIGGERS=1.
// The unhandled rejection itself is pinned by the spawned-server contract test (task 6.3): in-process it would hit vitest.

type LoggedError = { fields: Record<string, unknown>; message: string };

let app: FastifyInstance | undefined;
let logged: LoggedError[];
const original = process.env.VID4YOU_ERROR_TRIGGERS;

beforeEach(() => {
  resetTelemetryForTest();
  logged = [];
  setErrorLog({ error: (fields, message) => logged.push({ fields, message }) });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (original === undefined) delete process.env.VID4YOU_ERROR_TRIGGERS;
  else process.env.VID4YOU_ERROR_TRIGGERS = original;
  resetTelemetryForTest();
});

async function appWithTriggers(value: string | undefined): Promise<FastifyInstance> {
  if (value === undefined) delete process.env.VID4YOU_ERROR_TRIGGERS;
  else process.env.VID4YOU_ERROR_TRIGGERS = value;
  app = await buildApp();
  return app;
}

describe("error triggers", () => {
  it("do not exist without the variable", async () => {
    const server = await appWithTriggers(undefined);

    expect((await server.inject({ method: "POST", url: "/dev/errors/route-crash" })).statusCode).toBe(404);
    expect((await server.inject({ method: "POST", url: "/dev/errors/unhandled-rejection" })).statusCode).toBe(404);
    expect(logged).toEqual([]);
  });

  it("do not exist with any value other than 1", async () => {
    const server = await appWithTriggers("true");

    expect((await server.inject({ method: "POST", url: "/dev/errors/route-crash" })).statusCode).toBe(404);
  });

  it("route-crash answers 500 and reports a synthetic, tagged error", async () => {
    const server = await appWithTriggers("1");

    const response = await server.inject({ method: "POST", url: "/dev/errors/route-crash", payload: { tag: "jos-256-2026-11-04" } });

    expect(response.statusCode).toBe(500);
    expect(logged).toHaveLength(1);
    expect(logged[0]!.fields).toMatchObject({ stage: "api", route: "POST /dev/errors/route-crash", errorCode: "SYNTHETIC_ERROR" });
    expect(logged[0]!.message).toBe("synthetic route crash jos-256-2026-11-04");
  });

  it("route-crash works without a body", async () => {
    const server = await appWithTriggers("1");

    expect((await server.inject({ method: "POST", url: "/dev/errors/route-crash" })).statusCode).toBe(500);
    expect(logged[0]!.message).toBe("synthetic route crash untagged");
  });

  it("rejects a tag outside letters, digits and dashes, or longer than 40", async () => {
    const server = await appWithTriggers("1");

    for (const tag of ["has space", "a/b", "x".repeat(41), ""]) {
      const response = await server.inject({ method: "POST", url: "/dev/errors/route-crash", payload: { tag } });
      expect(response.statusCode, tag).toBe(400);
    }
    expect(logged).toEqual([]);
  });

  it("unhandled-rejection rejects an invalid tag before scheduling anything", async () => {
    const server = await appWithTriggers("1");

    expect((await server.inject({ method: "POST", url: "/dev/errors/unhandled-rejection", payload: { tag: "bad tag" } })).statusCode).toBe(400);
  });
});
