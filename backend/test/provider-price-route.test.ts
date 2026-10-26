import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeProviderId } from "../src/activeProvider.ts";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { loadCredential } from "../src/config/credentials.ts";
import { SETTINGS } from "../src/config/providers.ts";
import { resetAll } from "../src/db.ts";
import { resetKeyStoreCache, setLegacyCredentialLoader } from "../src/keyStore.ts";
import { createFalAiImageProvider } from "../src/imageProvider.ts";
import { seedProviderProfiles } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";

// add-provider-price-per-unit (JOS-226), group 3 — design Decisions 3 and 5; JOS-226 AC1-AC3 on the API side.

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


const priced = { ...imageBody, parameters: { model: "fal-ai/flux-pro", pricePerUnit: 0.04, priceCurrency: "usd" } };
const readProfile = async (id: string) => (await call("GET", "/admin/provider-profiles")).json().profiles.find((p: { id: string }) => p.id === id);

describe("saving a price", () => {
  it("POST saves the price and an upper-case currency, and GET returns them", async () => {
    const response = await call("POST", "/admin/provider-profiles", priced);
    expect(response.statusCode).toBe(201);
    expect((await readProfile(response.json().id)).parameters).toEqual({ model: "fal-ai/flux-pro", pricePerUnit: 0.04, priceCurrency: "USD" });
  });

  it("PUT saves a price, and an edit without the price fields removes it", async () => {
    const { profile } = await addImage();
    await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "Flux pro", parameters: priced.parameters });
    expect((await readProfile(profile.id)).parameters).toMatchObject({ pricePerUnit: 0.04, priceCurrency: "USD" });
    await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "Flux pro", parameters: { model: "fal-ai/flux-pro" } });
    expect((await readProfile(profile.id)).parameters).toEqual({ model: "fal-ai/flux-pro" });
  });

  it("stores zero as a price", async () => {
    const response = await call("POST", "/admin/provider-profiles", { ...priced, parameters: { model: "m", pricePerUnit: 0, priceCurrency: "EUR" } });
    expect((await readProfile(response.json().id)).parameters).toMatchObject({ pricePerUnit: 0, priceCurrency: "EUR" });
  });

  it("refuses an invalid price with every problem and stores nothing", async () => {
    const before = (await call("GET", "/admin/provider-profiles")).json().profiles.length;
    const response = await call("POST", "/admin/provider-profiles", { ...priced, label: "", parameters: { model: "m", pricePerUnit: -5, priceCurrency: "ZZZ" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().problems.map((problem: { field: string }) => problem.field).sort()).toEqual(["label", "priceCurrency", "pricePerUnit"]);
    expect((await call("GET", "/admin/provider-profiles")).json().profiles.length).toBe(before);
  });

  it("refuses a save without Administrator access (401) and stores nothing", async () => {
    const before = (await call("GET", "/admin/provider-profiles")).json().profiles.length;
    expect((await call("POST", "/admin/provider-profiles", priced, {})).statusCode).toBe(401);
    expect((await call("GET", "/admin/provider-profiles")).json().profiles.length).toBe(before);
  });
});

describe("GET /admin/provider-types", () => {
  it("lists the optional price and currency fields, the price labelled with the stage's unit", async () => {
    const { types } = (await call("GET", "/admin/provider-types")).json();
    const video = types.find((type: { id: string }) => type.id === "runninghub-video");
    expect(video.fields.slice(-2)).toMatchObject([
      { path: ["pricePerUnit"], label: "Price per clip second", kind: "number", required: false },
      { path: ["priceCurrency"], label: "Currency", kind: "text", required: false },
    ]);
  });
});

describe("a price changes nothing else", () => {
  it("keeps a priced profile usable and lets it be the active provider", async () => {
    const { profile } = await call("POST", "/admin/provider-profiles", priced).then(async (response) => ({ profile: response.json() }));
    expect((await readProfile(profile.id)).usable).toBe(true);
    const response = await call("PUT", "/admin/providers/image", { providerId: profile.id });
    expect(response.statusCode).toBe(200);
    expect(activeProviderId("image")).toBe(profile.id);
  });

  it("is not in the image request built from a priced profile", async () => {
    const bodies: string[] = [];
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response("{}", { status: 500 });
    }) as typeof fetch;
    await createFalAiImageProvider({ fetchFn, parameters: { model: "m", pricePerUnit: 0.04, priceCurrency: "USD" } as { model: string }, loadKey: () => "k" }).generate("a lighthouse");
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.join("")).not.toMatch(/price|USD|0\.04/i);
  });
});
