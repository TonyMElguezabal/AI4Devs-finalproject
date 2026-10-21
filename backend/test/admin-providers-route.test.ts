import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { activeProviderId, PROVIDER_STAGES } from "../src/activeProvider.ts";
import { db, resetAll } from "../src/db.ts";
import { resetAlignmentProviderRegistry, resetReasoningProviderRegistry, setAlignmentProviderRegistry, setReasoningProviderRegistry } from "../src/decompositionDependencies.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { buildApp } from "../src/server.ts";
import { resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// change-active-provider-from-admin (JOS-171), group 5 — design Decision 5; spec AC2 on the API side.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const adapters = { "stub-a": {}, "stub-b": {} } as never;

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  setAdminPasswordReader(() => PASSWORD);
  setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setImageProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters, labels: { "stub-a": "Stub A" }, aliases: [] });
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  resetAdminPasswordReader();
  resetReasoningProviderRegistry();
  resetAlignmentProviderRegistry();
  resetVoiceProviderRegistry();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
  resetAll();
});

describe("GET /admin/providers", () => {
  it("returns the five stages with their active provider, its source and the selectable adapters", async () => {
    const response = await app.inject({ method: "GET", url: "/admin/providers", headers: admin });
    expect(response.statusCode).toBe(200);
    const { providers } = response.json();
    expect(providers.map((view: { stage: string }) => view.stage)).toEqual([...PROVIDER_STAGES]);
    expect(providers.find((view: { stage: string }) => view.stage === "video")).toEqual({
      stage: "video",
      activeProviderId: "stub-a",
      activeLabel: "Stub A",
      source: "settings",
      selectable: [
        { id: "stub-a", label: "Stub A" },
        { id: "stub-b", label: "stub-b" },
      ],
      orphanedChoice: null,
    });
  });

  it("reports an /admin choice with source admin", async () => {
    await app.inject({ method: "PUT", url: "/admin/providers/video", headers: admin, payload: { providerId: "stub-b" } });
    const view = (await app.inject({ method: "GET", url: "/admin/providers", headers: admin })).json().providers.find((v: { stage: string }) => v.stage === "video");
    expect(view).toMatchObject({ activeProviderId: "stub-b", source: "admin" });
  });

  it("reports a choice this build no longer ships as orphaned, with the settings default active", async () => {
    db.prepare("INSERT INTO active_providers (stage, provider_id, changed_at) VALUES ('video', 'gone', '2026-10-21T00:00:00.000Z')").run();
    const view = (await app.inject({ method: "GET", url: "/admin/providers", headers: admin })).json().providers.find((v: { stage: string }) => v.stage === "video");
    expect(view).toMatchObject({ activeProviderId: "stub-a", source: "settings", orphanedChoice: "gone" });
  });
});

describe("PUT /admin/providers/:stage", () => {
  it("changes the active provider and answers the stage's new view", async () => {
    const response = await app.inject({ method: "PUT", url: "/admin/providers/video", headers: admin, payload: { providerId: "stub-b" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ stage: "video", activeProviderId: "stub-b", source: "admin" });
    expect(activeProviderId("video")).toBe("stub-b");
  });

  it("refuses a provider the stage does not ship with 400 and the selectable ids, and changes nothing", async () => {
    const response = await app.inject({ method: "PUT", url: "/admin/providers/voice", headers: admin, payload: { providerId: "acme" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "not-selectable", selectable: ["stub-a", "stub-b"] });
    expect(activeProviderId("voice")).toBe("stub-a");
  });

  it("refuses an unknown stage with 400", async () => {
    const response = await app.inject({ method: "PUT", url: "/admin/providers/captions", headers: admin, payload: { providerId: "stub-a" } });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a body without a providerId with 400", async () => {
    const response = await app.inject({ method: "PUT", url: "/admin/providers/video", headers: admin, payload: {} });
    expect(response.statusCode).toBe(400);
  });
});

describe("Administrator access (AC2)", () => {
  it.each([
    ["GET", "/admin/providers", undefined],
    ["PUT", "/admin/providers/video", { providerId: "stub-b" }],
  ] as const)("%s %s answers 401 without the password and writes nothing", async (method, url, payload) => {
    const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, reason: "password-required" });
    expect(activeProviderId("video")).toBe("stub-a");
  });

  it("answers 401 wrong-password and writes nothing for a different password", async () => {
    const response = await app.inject({ method: "PUT", url: "/admin/providers/video", headers: { authorization: "Bearer nope" }, payload: { providerId: "stub-b" } });
    expect(response.statusCode).toBe(401);
    expect(activeProviderId("video")).toBe("stub-a");
  });
});

describe("OpenAPI document", () => {
  it("lists both routes", async () => {
    const document = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    expect(document.paths["/admin/providers"]).toHaveProperty("get");
    expect(document.paths["/admin/providers/{stage}"]).toHaveProperty("put");
  });
});
