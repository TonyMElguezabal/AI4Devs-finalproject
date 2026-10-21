import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { resetAll } from "../src/db.ts";
import { routes } from "../src/routes.ts";
import { buildApp } from "../src/server.ts";
import { createAppLogger } from "../src/telemetry/logFile.ts";

// protect-admin-with-password (JOS-173), group 3 — design Decisions 4 and 6; spec AC1-AC3 on the API side.

const CORRECT = "correct-horse-battery-staple";
const WRONG = "wrong-horse-battery-staple";

let app: FastifyInstance;

beforeEach(() => {
  resetAll();
});

afterEach(async () => {
  await app?.close();
  resetAdminPasswordReader();
  resetAll();
});

const bearer = (password: string) => ({ authorization: `Bearer ${password}` });

describe("GET /admin/access (design Decision 4)", () => {
  it("answers 200 { configured: true, granted: true } for the correct password", async () => {
    setAdminPasswordReader(() => CORRECT);
    app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/admin/access", headers: bearer(CORRECT) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ configured: true, granted: true });
  });

  it("answers 401 password-required with no header", async () => {
    setAdminPasswordReader(() => CORRECT);
    app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/admin/access" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, reason: "password-required" });
  });

  it("answers 401 wrong-password for a different password", async () => {
    setAdminPasswordReader(() => CORRECT);
    app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/admin/access", headers: bearer(WRONG) });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, reason: "wrong-password" });
  });

  it("answers 401 not-configured when there is no password, with or without a header", async () => {
    setAdminPasswordReader(() => undefined);
    app = await buildApp();
    for (const headers of [{}, bearer(WRONG)]) {
      const response = await app.inject({ method: "GET", url: "/admin/access", headers });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ ok: false, reason: "not-configured" });
    }
  });

  it("answers the browser's cross-origin preflight without a password, allowing the Authorization header", async () => {
    setAdminPasswordReader(() => CORRECT);
    app = await buildApp();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/admin/access",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(String(response.headers["access-control-allow-headers"]).toLowerCase()).toContain("authorization");
  });
});

describe("The API document (design Decision 4)", () => {
  it("describes GET /admin/access with its 200 and 401 answers and the administratorPassword bearer scheme", async () => {
    app = await buildApp();
    await app.ready();
    const doc = (await app.inject({ method: "GET", url: "/docs/json" })).json();

    const operation = doc.paths["/admin/access"].get;
    expect(Object.keys(operation.responses)).toEqual(expect.arrayContaining(["200", "401"]));
    expect(doc.components.securitySchemes.administratorPassword).toMatchObject({ type: "http", scheme: "bearer" });
    expect(operation.security).toEqual([{ administratorPassword: [] }]);
  });

  it("marks every /admin/ operation with the scheme, so a later route is documented as protected without extra code", async () => {
    app = await buildApp();
    await app.ready();
    const doc = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    const adminOperations = Object.entries(doc.paths as Record<string, Record<string, { security?: unknown }>>)
      .filter(([path]) => path.startsWith("/admin/"))
      .flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({ path, method, operation })));

    expect(adminOperations.length).toBeGreaterThan(0);
    for (const { path, method, operation } of adminOperations) {
      expect(operation.security, `${method.toUpperCase()} ${path}`).toEqual([{ administratorPassword: [] }]);
    }
  });
});

describe("Every route under /admin/ is gated (spec 'A later Administrator endpoint is protected by default')", () => {
  it("answers 401 to each registered /admin/ route with no password, whoever registered it", async () => {
    setAdminPasswordReader(() => CORRECT);
    const seen: Array<{ method: string; url: string }> = [];
    const instance = Fastify();
    instance.setValidatorCompiler(validatorCompiler);
    instance.setSerializerCompiler(serializerCompiler);
    instance.addHook("onRoute", (route) => {
      for (const method of [route.method].flat()) {
        if (method !== "HEAD" && method !== "OPTIONS") seen.push({ method, url: route.url });
      }
    });
    await instance.register(routes);
    await instance.ready();
    app = instance;

    const adminRoutes = seen.filter((route) => route.url.startsWith("/admin/"));
    expect(adminRoutes.length).toBeGreaterThan(0);
    for (const { method, url } of adminRoutes) {
      const response = await instance.inject({ method: method as "GET", url: url.replace(/:\w+/g, "x") });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

describe("Regular pages and endpoints need no password (AC3)", () => {
  const regular = async (configured: string | undefined) => {
    setAdminPasswordReader(() => configured);
    app = await buildApp();
    const languages = await app.inject({ method: "GET", url: "/languages" });
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "No login", script: "A short test sentence.", language: "en" },
    });
    const sessionId = created.json().session.sessionId as string;
    const consulted = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    return { languages, created, consulted };
  };

  it("work with no Authorization header when a password is configured", async () => {
    const { languages, created, consulted } = await regular(CORRECT);
    expect(languages.statusCode).toBe(200);
    expect(created.statusCode).toBe(201);
    expect(consulted.statusCode).toBe(200);
  });

  it("work the same, and the app starts, when no password is configured", async () => {
    const { languages, created, consulted } = await regular(undefined);
    expect(languages.statusCode).toBe(200);
    expect(created.statusCode).toBe(201);
    expect(consulted.statusCode).toBe(200);
  });
});

describe("The password never reaches the log (design Decision 6)", () => {
  const SENTINEL_RIGHT = "sentinel-right-7f3a9c41e2";
  const SENTINEL_WRONG = "sentinel-wrong-b81d05a6c9";
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "vid4you-admin-log-"));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it("is in neither the standard output nor the log file, for a wrong or a correct password", async () => {
    setAdminPasswordReader(() => SENTINEL_RIGHT);
    const stdout: string[] = [];
    app = await buildApp({ logger: createAppLogger({ dir: logDir, stdout: { write: (chunk) => stdout.push(chunk) } }) });
    await app.ready();

    await app.inject({ method: "GET", url: "/admin/access", headers: bearer(SENTINEL_WRONG) });
    await app.inject({ method: "GET", url: "/admin/access", headers: bearer(SENTINEL_RIGHT) });
    await app.inject({ method: "GET", url: "/admin/access" });
    await app.close();

    const output = stdout.join("");
    const file = readFileSync(join(logDir, "vid4you.log"), "utf8");
    // Not vacuous: the requests themselves were logged.
    expect(output).toContain("/admin/access");
    expect(file).toContain("/admin/access");
    for (const sentinel of [SENTINEL_RIGHT, SENTINEL_WRONG]) {
      expect(output, "standard output").not.toContain(sentinel);
      expect(file, "log file").not.toContain(sentinel);
    }
  });
});
