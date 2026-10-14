import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server.ts";
import { db, resetAll } from "../src/db.ts";
import { setScriptModerator, type ModerationVerdict } from "../src/scriptModeration.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// moderate-script-at-submission (JOS-187), group 4 — POST /sessions asks the
// moderation endpoint before it registers anything.

let app: FastifyInstance;
let moderated: string[];

function moderatorAnswering(verdict: ModerationVerdict) {
  setScriptModerator({
    moderate: async (script) => {
      moderated.push(script);
      return verdict;
    },
  });
}

const runCount = () => (db.prepare("SELECT COUNT(*) c FROM runs").get() as { c: number }).c;
const sceneCount = () => (db.prepare("SELECT COUNT(*) c FROM scenes").get() as { c: number }).c;
const submit = (payload: unknown) => app.inject({ method: "POST", url: "/sessions", payload: payload as object });

const SCRIPT = "  A script about a harbor at dusk.  ";

beforeEach(async () => {
  resetAll();
  moderated = [];
  app = await buildApp();
});

describe("A clean script is registered as today", () => {
  it("answers 201 and moderates the exact script once", async () => {
    moderatorAnswering({ kind: "clean" });

    const res = await submit({ title: "Harbor", script: SCRIPT, language: "en" });

    expect(res.statusCode).toBe(201);
    expect(res.json().session.state).toBe("submitted");
    expect(moderated).toEqual([SCRIPT]);
  });
});

describe("A flagged script is refused", () => {
  it("answers 422 naming the categories and creates nothing", async () => {
    moderatorAnswering({ kind: "flagged", categories: ["illicit", "violence"] });
    const voice = createStubVoiceProvider("hang");
    setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": voice } });

    const res = await submit({ title: "Harbor", script: SCRIPT, language: "en" });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toContain("illicit");
    expect(body.reason).toContain("violence");
    expect(body.reason).not.toContain("harbor");
    expect(runCount()).toBe(0);
    expect(sceneCount()).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(voice.calls).toHaveLength(0);
  });
});

describe("A script that cannot be checked is refused", () => {
  it("answers 503 and creates nothing", async () => {
    moderatorAnswering({ kind: "unavailable", reason: "the content check could not be reached" });

    const res = await submit({ title: "Harbor", script: SCRIPT, language: "en" });

    expect(res.statusCode).toBe(503);
    expect(res.json().ok).toBe(false);
    expect(res.json().reason).toMatch(/unavailable/i);
    expect(runCount()).toBe(0);
  });
});

describe("An invalid body is refused before moderation", () => {
  it.each([
    ["an empty script", { title: "T", script: "", language: "en" }],
    ["an unsupported language", { title: "T", script: "s", language: "xx" }],
  ])("%s: 400 and the moderator is not called", async (_name, payload) => {
    moderatorAnswering({ kind: "clean" });

    const res = await submit(payload);

    expect(res.statusCode).toBe(400);
    expect(moderated).toEqual([]);
  });
});
