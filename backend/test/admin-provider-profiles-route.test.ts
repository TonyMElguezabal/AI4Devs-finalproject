import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeProviderId } from "../src/activeProvider.ts";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { loadCredential } from "../src/config/credentials.ts";
import { SETTINGS } from "../src/config/providers.ts";
import { createRun, db, resetAll } from "../src/db.ts";
import { resetKeyStoreCache, setLegacyCredentialLoader } from "../src/keyStore.ts";
import { seedProviderProfiles } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";
import { createAppLogger } from "../src/telemetry/logFile.ts";

// manage-providers-from-admin (JOS-218), group 6 — design Decisions 6, 7 and 9; JOS-218 AC1-AC9 on the API side.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const KEY = "sk-example-1234567890ab";
const imageBody = { stage: "image", adapterType: "fal-image", label: "Flux pro", parameters: { model: "fal-ai/flux-pro" }, apiKey: KEY };

let app: FastifyInstance;
let folder: string;

beforeEach(async () => {
  resetAll();
  folder = mkdtempSync(join(tmpdir(), "vid4you-profiles-route-"));
  process.env.PROVIDER_KEY_PATH = join(folder, "provider-keys.key");
  resetKeyStoreCache();
  setLegacyCredentialLoader(() => {
    throw new Error("no legacy key in this test");
  });
  seedProviderProfiles(SETTINGS);
  setAdminPasswordReader(() => PASSWORD);
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  resetAdminPasswordReader();
  rmSync(folder, { recursive: true, force: true });
  delete process.env.PROVIDER_KEY_PATH;
  setLegacyCredentialLoader(loadCredential);
  resetKeyStoreCache();
  resetAll();
});

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = admin) =>
  app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) });

async function addImage(overrides: Record<string, unknown> = {}) {
  const response = await call("POST", "/admin/provider-profiles", { ...imageBody, ...overrides });
  return { response, profile: response.json() };
}

describe("GET /admin/provider-types", () => {
  it("lists the adapter types of every stage with their field descriptions", async () => {
    const response = await call("GET", "/admin/provider-types");
    expect(response.statusCode).toBe(200);
    const { types } = response.json();
    expect(types.map((type: { id: string }) => type.id).sort()).toEqual(["elevenlabs-alignment", "elevenlabs-voice", "fal-image", "openai-reasoning", "runninghub-video"]);
    const image = types.find((type: { id: string }) => type.id === "fal-image");
    expect(image).toMatchObject({ stage: "image", label: "Fal.ai", fields: [{ path: ["model"], kind: "text", required: true }, { path: ["pricePerUnit"], label: "Price per image" }, { path: ["priceCurrency"], label: "Currency" }] });
  });
});

describe("GET /admin/provider-profiles", () => {
  it("lists the five seeded profiles with their status and no key", async () => {
    const response = await call("GET", "/admin/provider-profiles");
    expect(response.statusCode).toBe(200);
    const { profiles } = response.json();
    expect(profiles.map((profile: { id: string }) => profile.id)).toEqual(["openai-decomposition", "ElevenLabs", "elevenlabs-forced-alignment", "Fal.ai", "RunningHub"]);
    expect(profiles[3]).toEqual({
      id: "Fal.ai",
      stage: "image",
      adapterType: "fal-image",
      label: "Fal.ai",
      parameters: { model: SETTINGS.image.model },
      keyStatus: "missing",
      keyHint: null,
      usable: false,
      problems: [{ field: "apiKey", message: "apiKey: no API key is stored or found for this provider" }],
      active: true,
      retired: false,
    });
  });
});

describe("POST /admin/provider-profiles", () => {
  it("creates a profile (201), shows the key only as a status and hint, and keeps it out of the database in clear text", async () => {
    const { response, profile } = await addImage();
    expect(response.statusCode).toBe(201);
    expect(profile).toMatchObject({ stage: "image", adapterType: "fal-image", label: "Flux pro", keyStatus: "stored", keyHint: "90ab", usable: true, active: false, retired: false });
    expect(JSON.stringify(profile)).not.toContain(KEY);
    const stored = (db.prepare("SELECT api_key_encrypted AS k FROM provider_profiles WHERE id = ?").get(profile.id) as { k: string }).k;
    expect(stored).not.toContain(KEY);
    expect(readFileSync(join(folder, "provider-keys.key"))).toHaveLength(32);
  });

  it("can be made active once it exists", async () => {
    const { profile } = await addImage();
    const response = await call("PUT", "/admin/providers/image", { providerId: profile.id });
    expect(response.statusCode).toBe(200);
    expect(activeProviderId("image")).toBe(profile.id);
  });

  it("refuses an adapter type the stage does not ship, listing nothing stored", async () => {
    const { response } = await addImage({ stage: "voice" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, problems: [{ field: "adapterType", message: "adapterType: the voice stage does not ship this adapter type" }] });
    expect((await call("GET", "/admin/provider-profiles")).json().profiles).toHaveLength(5);
  });

  it("refuses an unknown or host-like parameter and a duplicate label, listing every problem", async () => {
    const { response } = await addImage({ label: "Fal.ai", parameters: { model: "fal-ai/flux-pro", host: "evil.example" } });
    expect(response.statusCode).toBe(400);
    const { problems } = response.json();
    expect(problems.map((problem: { field: string }) => problem.field).sort()).toEqual(["host", "label"]);
    expect(JSON.stringify(response.json())).not.toContain(KEY);
  });

  it("refuses a video profile whose shortest duration is above the segmentation lower bound", async () => {
    const { response } = await call("POST", "/admin/provider-profiles", {
      stage: "video",
      adapterType: "runninghub-video",
      label: "Long only",
      parameters: { endpoint: "/openapi/v2/x", admittedDurationSeconds: { min: SETTINGS.segmentation.lowerBoundSeconds + 3, max: 20 } },
    }).then((r) => ({ response: r }));
    expect(response.statusCode).toBe(400);
    expect(response.json().problems[0].field).toBe("admittedDurationSeconds.min");
  });
});

describe("PUT /admin/provider-profiles/{id}", () => {
  it("edits the label and parameters and keeps the key when apiKey is absent", async () => {
    const { profile } = await addImage();
    const response = await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "Flux pro 2", parameters: { model: "fal-ai/flux-pro-2" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ label: "Flux pro 2", parameters: { model: "fal-ai/flux-pro-2" }, keyStatus: "stored", keyHint: "90ab" });
  });

  it("replaces the key when apiKey is present", async () => {
    const { profile } = await addImage();
    const response = await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "Flux pro", parameters: { model: "fal-ai/flux-pro" }, apiKey: "another-long-key-wxyz" });
    expect(response.json()).toMatchObject({ keyStatus: "stored", keyHint: "wxyz" });
  });

  it("refuses invalid parameters with every problem and changes nothing", async () => {
    const { profile } = await addImage();
    const response = await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "", parameters: { model: "https://evil.example" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().problems.map((problem: { field: string }) => problem.field).sort()).toEqual(["label", "model"]);
    expect((await call("GET", "/admin/provider-profiles")).json().profiles.find((p: { id: string }) => p.id === profile.id)).toMatchObject({ label: "Flux pro" });
  });

  it("answers 404 for an unknown profile", async () => {
    expect((await call("PUT", "/admin/provider-profiles/nope", { label: "x", parameters: { model: "m" } })).statusCode).toBe(404);
  });
});

describe("DELETE /admin/provider-profiles/{id}", () => {
  it("refuses the active profile with 409, naming the stage", async () => {
    const response = await call("DELETE", "/admin/provider-profiles/Fal.ai");
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ ok: false, reason: "active", stage: "image" });
  });

  it("removes a profile nothing refers to", async () => {
    const { profile } = await addImage();
    const response = await call("DELETE", `/admin/provider-profiles/${profile.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ result: "removed" });
    expect((await call("GET", "/admin/provider-profiles")).json().profiles).toHaveLength(5);
  });

  it("retires a profile a scene is bound to, which then stays out of the choices but is still listed as retired", async () => {
    const { profile } = await addImage();
    const runId = "run-1";
    createRun(runId, "Bound", "script", "en");
    db.prepare("INSERT INTO scenes (id, run_id, idx, status, provider, updated_at) VALUES ('s1', ?, 1, 'submitted', ?, ?)").run(runId, profile.id, new Date().toISOString());
    const response = await call("DELETE", `/admin/provider-profiles/${profile.id}`);
    expect(response.json()).toEqual({ result: "retired" });
    const listed = (await call("GET", "/admin/provider-profiles")).json().profiles.find((p: { id: string }) => p.id === profile.id);
    expect(listed).toMatchObject({ retired: true });
    expect((await call("PUT", "/admin/providers/image", { providerId: profile.id })).statusCode).toBe(400);
  });

  it("answers 404 for an unknown profile", async () => {
    expect((await call("DELETE", "/admin/provider-profiles/nope")).statusCode).toBe(404);
  });
});

describe("PUT /admin/providers/{stage} with profiles", () => {
  it("refuses a profile that is not usable, with the reasons", async () => {
    const { profile } = await addImage({ apiKey: undefined });
    const response = await call("PUT", "/admin/providers/image", { providerId: profile.id });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ ok: false, reason: "not-usable", problems: [{ field: "apiKey" }] });
    expect(activeProviderId("image")).toBe("Fal.ai");
  });
});

describe("Administrator access (AC8)", () => {
  it.each([
    ["GET", "/admin/provider-types", undefined],
    ["GET", "/admin/provider-profiles", undefined],
    ["POST", "/admin/provider-profiles", imageBody],
    ["PUT", "/admin/provider-profiles/Fal.ai", { label: "x", parameters: { model: "m" } }],
    ["DELETE", "/admin/provider-profiles/Fal.ai", undefined],
  ] as const)("%s %s answers 401 without the password and writes nothing", async (method, url, payload) => {
    const response = await call(method, url, payload, {});
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, reason: "password-required" });
    expect((await call("GET", "/admin/provider-profiles")).json().profiles).toHaveLength(5);
  });
});

describe("the key never leaves the server", () => {
  it("is in no response body, however the profile is read", async () => {
    const { profile } = await addImage();
    const bodies = [
      (await call("GET", "/admin/provider-profiles")).body,
      (await call("GET", `/admin/providers`)).body,
      (await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "Flux pro", parameters: { model: "fal-ai/flux-pro" }, apiKey: KEY })).body,
    ];
    for (const body of bodies) expect(body).not.toContain(KEY);
  });
});

describe("OpenAPI document", () => {
  it("lists the new routes", async () => {
    const document = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    expect(document.paths["/admin/provider-types"]).toHaveProperty("get");
    expect(document.paths["/admin/provider-profiles"]).toHaveProperty("get");
    expect(document.paths["/admin/provider-profiles"]).toHaveProperty("post");
    expect(document.paths["/admin/provider-profiles/{id}"]).toHaveProperty("put");
    expect(document.paths["/admin/provider-profiles/{id}"]).toHaveProperty("delete");
  });
});

describe("a key sent to the API is never logged", () => {
  it("is in neither the standard output nor the log file, even when the request is refused", async () => {
    await app.close();
    const logDir = mkdtempSync(join(tmpdir(), "vid4you-keylog-"));
    const stdout: string[] = [];
    app = await buildApp({ logger: createAppLogger({ dir: logDir, stdout: { write: (chunk) => stdout.push(chunk) } }) });
    await app.ready();

    await call("POST", "/admin/provider-profiles", { ...imageBody, parameters: { model: "https://evil.example" } }); // refused: invalid
    await call("POST", "/admin/provider-profiles", imageBody); // accepted
    await call("POST", "/admin/provider-profiles", imageBody, {}); // refused: no password
    await app.close();

    const output = stdout.join("");
    const file = readFileSync(join(logDir, "vid4you.log"), "utf8");
    expect(output).toContain("/admin/provider-profiles"); // not vacuous: the requests were logged
    expect(file).toContain("/admin/provider-profiles");
    expect(output).not.toContain(KEY);
    expect(file).not.toContain(KEY);
    rmSync(logDir, { recursive: true, force: true });
    app = await buildApp();
  });
});
