import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { loadCredential } from "../src/config/credentials.ts";
import { SETTINGS } from "../src/config/providers.ts";
import { db, resetAll } from "../src/db.ts";
import { resetKeyStoreCache, setLegacyCredentialLoader } from "../src/keyStore.ts";
import { CONNECTION_CHECKS, resetConnectionCheckFetch, setConnectionCheckFetch } from "../src/providerConnectionCheck.ts";
import { seedProviderProfiles } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";
import { createAppLogger } from "../src/telemetry/logFile.ts";

// test-provider-connection (JOS-220), group 2 — design Decisions 1, 3, 4 and 5; the route side of the spec.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const KEY = "sk-example-1234567890ab";
const imageBody = { stage: "image", adapterType: "fal-image", label: "Flux pro", parameters: { model: "fal-ai/flux-pro" }, apiKey: KEY };

let app: FastifyInstance;
let folder: string;
const fetchStub = vi.fn<typeof fetch>();

beforeEach(async () => {
  resetAll();
  folder = mkdtempSync(join(tmpdir(), "vid4you-connection-test-"));
  process.env.PROVIDER_KEY_PATH = join(folder, "provider-keys.key");
  resetKeyStoreCache();
  setLegacyCredentialLoader(() => {
    throw new Error("no legacy key in this test");
  });
  seedProviderProfiles(SETTINGS);
  setAdminPasswordReader(() => PASSWORD);
  fetchStub.mockReset();
  fetchStub.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ models: [{}] }), { status: 200 })));
  setConnectionCheckFetch(fetchStub);
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  resetConnectionCheckFetch();
  resetAdminPasswordReader();
  rmSync(folder, { recursive: true, force: true });
  delete process.env.PROVIDER_KEY_PATH;
  setLegacyCredentialLoader(loadCredential);
  resetKeyStoreCache();
  resetAll();
});

const call = (method: "GET" | "POST", url: string, payload?: unknown, headers: Record<string, string> = admin) =>
  app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) });

async function addImageProfile(): Promise<string> {
  const response = await call("POST", "/admin/provider-profiles", imageBody);
  return response.json().id as string;
}

describe("GET /admin/provider-types", () => {
  it("states per type whether its check is charged and what it covers", async () => {
    const { types } = (await call("GET", "/admin/provider-types")).json();
    for (const type of types as { id: string; connectionCheck: { charged: boolean; covers: string } }[]) {
      expect(type.connectionCheck).toEqual({ charged: CONNECTION_CHECKS[type.id]!.charged, covers: CONNECTION_CHECKS[type.id]!.covers });
    }
  });
});

describe("POST /admin/provider-profiles/:id/test", () => {
  it("answers 401 without the password and sends nothing to the vendor", async () => {
    const id = await addImageProfile();
    const response = await call("POST", `/admin/provider-profiles/${id}/test`, {}, {});
    expect(response.statusCode).toBe(401);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown profile and sends nothing", async () => {
    const response = await call("POST", "/admin/provider-profiles/nope/test", {});
    expect(response.statusCode).toBe(404);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("answers no-key for a profile without a key and sends nothing", async () => {
    const response = await call("POST", "/admin/provider-profiles/Fal.ai/test", {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: "no-key", covers: CONNECTION_CHECKS["fal-image"]!.covers });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("sends one request with the stored key and answers the outcome with what it covered", async () => {
    const id = await addImageProfile();
    const response = await call("POST", `/admin/provider-profiles/${id}/test`, {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: "connected", covers: CONNECTION_CHECKS["fal-image"]!.covers });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetchStub.mock.calls[0]![1])).toContain(KEY);
  });

  it("answers the vendor's HTTP status for an unexpected answer", async () => {
    const id = await addImageProfile();
    fetchStub.mockImplementation(() => Promise.resolve(new Response("{}", { status: 502 })));
    expect((await call("POST", `/admin/provider-profiles/${id}/test`, {})).json()).toEqual({ outcome: "unexpected", covers: CONNECTION_CHECKS["fal-image"]!.covers, httpStatus: 502 });
  });

  describe("a charged check", () => {
    let original: boolean;
    beforeEach(() => {
      original = CONNECTION_CHECKS["fal-image"]!.charged;
      CONNECTION_CHECKS["fal-image"]!.charged = true;
    });
    afterEach(() => {
      CONNECTION_CHECKS["fal-image"]!.charged = original;
    });

    it("is refused with 409 charge-not-accepted and nothing is sent when the charge is not accepted", async () => {
      const id = await addImageProfile();
      for (const body of [{}, { acceptCharge: false }]) {
        const response = await call("POST", `/admin/provider-profiles/${id}/test`, body);
        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ ok: false, reason: "charge-not-accepted" });
      }
      expect(fetchStub).not.toHaveBeenCalled();
    });

    it("is sent once when the charge is accepted", async () => {
      const id = await addImageProfile();
      expect((await call("POST", `/admin/provider-profiles/${id}/test`, { acceptCharge: true })).statusCode).toBe(200);
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });
  });

  it("needs no confirmation for a free check", async () => {
    const id = await addImageProfile();
    expect((await call("POST", `/admin/provider-profiles/${id}/test`, {})).statusCode).toBe(200);
  });
});

describe("a test writes nothing", () => {
  const counts = () => ({
    providerRequests: (db.prepare("SELECT COUNT(*) AS n FROM provider_requests").get() as { n: number }).n,
    stageAttempts: (db.prepare("SELECT COUNT(*) AS n FROM stage_attempts").get() as { n: number }).n,
  });

  it.each([
    ["a pass", 200],
    ["a rejected key", 401],
  ])("leaves the profile, key status, active providers and attempt records identical after %s", async (_name, status) => {
    const id = await addImageProfile();
    fetchStub.mockImplementation(() => Promise.resolve(new Response("{}", { status })));
    const snapshot = async () => ({
      profiles: (await call("GET", "/admin/provider-profiles")).json(),
      active: db.prepare("SELECT * FROM active_providers ORDER BY 1").all(),
      counts: counts(),
    });
    const before = await snapshot();
    await call("POST", `/admin/provider-profiles/${id}/test`, {});
    expect(await snapshot()).toEqual(before);
  });
});

describe("a test never reveals the key", () => {
  it("keeps a key echoed by the vendor out of the response and the logs, and answers only the closed fields", async () => {
    await app.close();
    const logDir = mkdtempSync(join(tmpdir(), "vid4you-testlog-"));
    const stdout: string[] = [];
    app = await buildApp({ logger: createAppLogger({ dir: logDir, stdout: { write: (chunk) => stdout.push(chunk) } }) });
    await app.ready();
    const id = await addImageProfile();
    fetchStub.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { message: `Invalid key ${KEY}` } }), { status: 401 })));

    const response = await call("POST", `/admin/provider-profiles/${id}/test`, {});
    await app.close();

    expect(response.json()).toEqual({ outcome: "key-rejected", covers: CONNECTION_CHECKS["fal-image"]!.covers });
    expect(response.body).not.toContain(KEY);
    const output = stdout.join("");
    const file = readFileSync(join(logDir, "vid4you.log"), "utf8");
    expect(output).toContain("/test"); // not vacuous
    expect(output).not.toContain(KEY);
    expect(file).not.toContain(KEY);
    rmSync(logDir, { recursive: true, force: true });
    app = await buildApp();
  });
});
