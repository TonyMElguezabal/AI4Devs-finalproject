import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { loadCredential } from "../src/config/credentials.ts";
import { SETTINGS } from "../src/config/providers.ts";
import { resetAll } from "../src/db.ts";
import { keyFor, resetKeyStoreCache, setLegacyCredentialLoader, storeProfileKey } from "../src/keyStore.ts";
import { insertProfile, seedProviderProfiles } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";
import { describeProvider } from "../src/stageDiagnostics.ts";
import { getVideoProviderRegistry, resetVideoProviderRegistry } from "../src/videoProvider.ts";
import { definitionRequests, json, runwayParameters, withStep } from "./videoConnectorFixtures.ts";

// configurable-video-connector (JOS-219), tasks 2.5-2.8 — a configured connector next to the coded RunningHub adapter:
// the registry, the admin rules (durations, resolution, the key bound to its host, copying a key), the connection test
// and the diagnostics.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const RUNWAY_KEY = "key_runway_0123456789abcdef";
const RUNNINGHUB_KEY = "runninghub-0123456789abcdef";
const NOW = "2099-01-01T00:00:00.000Z";

let app: FastifyInstance;
let folder: string;
let requests: Array<{ url: string; init: RequestInit }>;
let answer: (url: string) => Response;

beforeEach(async () => {
  resetAll();
  folder = mkdtempSync(join(tmpdir(), "vid4you-connector-admin-"));
  process.env.PROVIDER_KEY_PATH = join(folder, "provider-keys.key");
  resetKeyStoreCache();
  setLegacyCredentialLoader(() => {
    throw new Error("no legacy key in this test");
  });
  seedProviderProfiles(SETTINGS);
  setAdminPasswordReader(() => PASSWORD);
  requests = [];
  answer = () => json({}, 500);
  vi.stubGlobal("fetch", async (url: string | URL | Request, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });
    return answer(String(url));
  });
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
  resetAdminPasswordReader();
  rmSync(folder, { recursive: true, force: true });
  delete process.env.PROVIDER_KEY_PATH;
  setLegacyCredentialLoader(loadCredential);
  resetKeyStoreCache();
  resetVideoProviderRegistry();
  resetAll();
});

const call = (method: "GET" | "POST" | "PUT", url: string, payload?: unknown) =>
  app.inject({ method, url, headers: admin, ...(payload === undefined ? {} : { payload: payload as object }) });

const connectorBody = (overrides: Record<string, unknown> = {}, parameters: Record<string, unknown> = {}) => ({
  stage: "video",
  adapterType: "configured-video",
  label: "Runway Wan",
  parameters: runwayParameters(parameters),
  apiKey: RUNWAY_KEY,
  ...overrides,
});

async function addConnector(overrides: Record<string, unknown> = {}, parameters: Record<string, unknown> = {}) {
  const response = await call("POST", "/admin/provider-profiles", connectorBody(overrides, parameters));
  return { response, profile: response.json() as Record<string, unknown> & { id: string } };
}

describe("the video registry builds each profile with its own adapter type (task 2.5)", () => {
  it("sends a RunningHub clip to RunningHub and a connector clip to its own host, each with its own key", async () => {
    storeProfileKey("RunningHub", RUNNINGHUB_KEY);
    insertProfile({ id: "01RUNWAY", stage: "video", adapterType: "configured-video", label: "Runway Wan", parameters: runwayParameters() }, NOW);
    storeProfileKey("01RUNWAY", RUNWAY_KEY);
    answer = (url) => (url.includes("/media/upload") ? json({ code: 0, data: { download_url: "https://cdn.runninghub.io/a.png" } }) : json({ id: "task-1", taskId: "T1", errorCode: "" }));

    const registry = getVideoProviderRegistry();
    const params = { imageBytes: Buffer.from("png"), instruction: "animate", durationSeconds: 6 };
    await registry.adapters.RunningHub!.submit(params);
    await registry.adapters["01RUNWAY"]!.submit(params);

    const hostAndKey = requests.map(({ url, init }) => [new URL(url).host, (init.headers as Record<string, string>).Authorization]);
    expect(hostAndKey).toEqual([
      ["www.runninghub.ai", `Bearer ${RUNNINGHUB_KEY}`],
      ["www.runninghub.ai", `Bearer ${RUNNINGHUB_KEY}`],
      ["api.dev.runwayml.com", `Bearer ${RUNWAY_KEY}`],
    ]);
  });
});

describe("saving a connector profile (task 2.6)", () => {
  it("stores the Runway definition and offers it among the video types", async () => {
    const types = (await call("GET", "/admin/provider-types")).json().types as Array<{ id: string; stage: string; fields: Array<{ path: string[]; kind: string }> }>;
    const connector = types.find((type) => type.id === "configured-video");
    expect(connector).toMatchObject({ stage: "video" });
    expect(connector!.fields).toContainEqual(expect.objectContaining({ path: ["requests"], kind: "json" }));

    const { response, profile } = await addConnector();
    expect(response.statusCode).toBe(201);
    expect(profile).toMatchObject({ adapterType: "configured-video", keyStatus: "stored", usable: true });
    expect(JSON.stringify(profile)).not.toContain(RUNWAY_KEY);
  });

  it("refuses a shortest clip above the segmentation bound, as for RunningHub", async () => {
    const { response } = await addConnector({}, { admittedDurationSeconds: { min: 8, max: 15 } });
    expect(response.statusCode).toBe(400);
    expect(response.json().problems).toEqual([{ field: "admittedDurationSeconds.min", message: expect.stringMatching(/segmentation lower bound/) }]);
  });

  it("refuses a RunningHub resolution of 2K, naming the 1080p limit", async () => {
    const seeded = (await call("GET", "/admin/provider-profiles")).json().profiles.find((profile: { id: string }) => profile.id === "RunningHub");
    const response = await call("PUT", "/admin/provider-profiles/RunningHub", { label: seeded.label, parameters: { ...seeded.parameters, resolution: "2K" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().problems).toEqual([{ field: "resolution", message: expect.stringMatching(/1080p|768P/) }]);
  });

  it("clears the stored key when the host changes, and says so", async () => {
    const { profile } = await addConnector();
    const response = await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "Runway Wan", parameters: runwayParameters({ baseUrl: "https://other.example" }) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ keyStatus: "missing", keyCleared: true, usable: false });
  });

  it("keeps the key when the host stays the same", async () => {
    const { profile } = await addConnector();
    const response = await call("PUT", `/admin/provider-profiles/${profile.id}`, { label: "Runway Wan", parameters: runwayParameters({ model: "wan3_prime" }) });
    expect(response.json()).toMatchObject({ keyStatus: "stored" });
    expect(response.json().keyCleared).toBeUndefined();
  });

  it("copies the key of a connector on the same host, without the key reaching the page", async () => {
    const { profile: wan } = await addConnector();
    const { response, profile: kling } = await addConnector({ label: "Runway Kling", apiKey: undefined, copyKeyFrom: wan.id }, { model: "kling_4" });
    expect(response.statusCode).toBe(201);
    expect(kling).toMatchObject({ keyStatus: "stored", keyHint: RUNWAY_KEY.slice(-4) });
    expect(JSON.stringify(kling)).not.toContain(RUNWAY_KEY);
    expect(keyFor(kling.id)).toBe(RUNWAY_KEY);
  });

  it.each([
    ["another host", { label: "Other", apiKey: undefined }, { baseUrl: "https://other.example" }],
  ])("refuses to copy a key to %s", async (_name, overrides, parameters) => {
    const { profile: wan } = await addConnector();
    const { response } = await addConnector({ ...overrides, copyKeyFrom: wan.id }, parameters);
    expect(response.statusCode).toBe(400);
    expect(response.json().problems).toEqual([{ field: "copyKeyFrom", message: expect.any(String) }]);
  });

  it("refuses to copy the key of a profile of another adapter type", async () => {
    storeProfileKey("RunningHub", RUNNINGHUB_KEY);
    const { response } = await addConnector({ apiKey: undefined, copyKeyFrom: "RunningHub" });
    expect(response.statusCode).toBe(400);
    expect(response.json().problems).toEqual([{ field: "copyKeyFrom", message: expect.any(String) }]);
  });
});

describe("testing a connector's connection (task 2.7)", () => {
  it("sends the definition's check step to its host with its headers", async () => {
    const { profile } = await addConnector();
    answer = () => json({ creditBalance: 4886 });

    const response = await call("POST", `/admin/provider-profiles/${profile.id}/test`, {});

    expect(response.json()).toEqual({ outcome: "connected", covers: expect.stringMatching(/Only the key was checked/) });
    expect(requests.map(({ url, init }) => [init.method, url])).toEqual([["GET", "https://api.dev.runwayml.com/v1/organization"]]);
    expect(requests[0]!.init.headers).toMatchObject({ Authorization: `Bearer ${RUNWAY_KEY}`, "X-Runway-Version": "2024-11-06" });
  });

  it("sends nothing and says so when the definition has no check step", async () => {
    const { profile } = await addConnector({}, { requests: withStep(definitionRequests("runway"), "check", null) });

    const response = await call("POST", `/admin/provider-profiles/${profile.id}/test`, {});

    expect(response.json()).toMatchObject({ outcome: "no-check" });
    expect(requests).toHaveLength(0);
  });

  it("asks for confirmation before a check the definition marks as charged", async () => {
    const { profile } = await addConnector({}, { requests: withStep(definitionRequests("runway"), "check", { charged: true }) });

    expect((await call("POST", `/admin/provider-profiles/${profile.id}/test`, {})).statusCode).toBe(409);
    expect(requests).toHaveLength(0);
    answer = () => json({});
    expect((await call("POST", `/admin/provider-profiles/${profile.id}/test`, { acceptCharge: true })).json()).toMatchObject({ outcome: "connected" });
  });
});

describe("the diagnostics of a connector clip (task 2.8)", () => {
  it("name the profile's label and its model", async () => {
    const { profile } = await addConnector({ label: "Runway Kling" }, { model: "kling_4" });
    expect(describeProvider("video", profile.id)).toEqual({ name: "Runway Kling", model: "kling_4" });
    expect(describeProvider("video", "RunningHub")).toEqual({ name: "RunningHub", model: "minimax/hailuo-h3" });
  });
});
