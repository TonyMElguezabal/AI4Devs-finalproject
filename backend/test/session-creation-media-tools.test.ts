import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server.ts";
import { db, resetAll } from "../src/db.ts";
import { setMediaToolsCheck } from "../src/mediaToolsCheck.ts";
import { setScriptModerator } from "../src/scriptModeration.ts";

// detect-blocked-media-tools (JOS-271), group 1 — POST /sessions refuses a session the media tools could not finish,
// before the content check (a paid request) and before anything is created.

let app: FastifyInstance;
let moderated: string[];

const runCount = () => (db.prepare("SELECT COUNT(*) c FROM runs").get() as { c: number }).c;
const submit = () => app.inject({ method: "POST", url: "/sessions", payload: { title: "Harbor", script: "A script about a harbor at dusk.", language: "en" } });

beforeEach(async () => {
  resetAll();
  moderated = [];
  setScriptModerator({
    moderate: async (script) => {
      moderated.push(script);
      return { kind: "clean" };
    },
  });
  app = await buildApp();
});

describe("A session is refused when the media tools cannot run", () => {
  it("answers 503 with the reason, creates no session and does not call the content check", async () => {
    const message = "macOS blocked ffprobe. Run: xattr -dr com.apple.quarantine <the Vid4You folder>";
    setMediaToolsCheck(async () => ({ ok: false, problem: "blocked", tool: "ffprobe", message }));

    const res = await submit();

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, reason: message });
    expect(runCount()).toBe(0);
    expect(moderated).toEqual([]);
  });

  it("creates the session as before when the tools are ready", async () => {
    setMediaToolsCheck(async () => ({ ok: true }));

    const res = await submit();

    expect(res.statusCode).toBe(201);
    expect(runCount()).toBe(1);
    expect(moderated).toHaveLength(1);
  });
});
