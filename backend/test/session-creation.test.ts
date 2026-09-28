import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server.ts";
import { getRun, resetAll } from "../src/db.ts";
import { SUPPORTED_LANGUAGE_CODES } from "../src/config/providers.ts";
import type { FastifyInstance } from "fastify";

// start-video-project (JOS-134) — session registration. HTTP-level tests via
// Fastify's own `.inject()` (no real port bound), since this is the first
// story with an endpoint the skeleton's own tests never exercised over HTTP.

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
});

const LONG_SCRIPT = "A narrated sentence about the harbor at dusk. ".repeat(2000); // ~2200 words, well past the 1500-word reference (AC04)

describe("A valid project is started (AC01)", () => {
  it("registers a session with an identifier in state submitted", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "My Trip", script: "A wide shot of a harbor at dusk.", language: "en" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.session.sessionId).toBeTruthy();
    expect(body.session.state).toBe("submitted");
  });

  it("generates an opaque, creation-ordered identifier (Decision 3)", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "A", script: "script a", language: "en" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "B", script: "script b", language: "en" },
    });
    const idA = first.json().session.sessionId as string;
    const idB = second.json().session.sessionId as string;
    expect(idA).not.toBe(idB);
    expect(idA < idB).toBe(true); // ULID: lexicographic order == creation order
    expect(idA).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // opaque ULID shape, not derived from the title
  });
});

describe("A plain script is submitted (AC02)", () => {
  it("accepts a script with no tags, delimiters or visual instructions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Plain", script: "Just plain narration text, nothing special.", language: "en" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("Two projects with the same title and script (Decision 7)", () => {
  it("creates two separate sessions with different identifiers", async () => {
    const payload = { title: "Same Title", script: "Same script.", language: "en" };
    const first = await app.inject({ method: "POST", url: "/sessions", payload });
    const second = await app.inject({ method: "POST", url: "/sessions", payload });
    expect(first.json().session.sessionId).not.toBe(second.json().session.sessionId);
  });
});

describe("An empty title or script starts nothing (AC03)", () => {
  it("refuses an empty title", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "", script: "some script", language: "en" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses an empty script", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Some Title", script: "", language: "en" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a whitespace-only title (Decision 1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "   \n\t  ", script: "some script", language: "en" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a whitespace-only script (Decision 1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Some Title", script: "   \n\t  ", language: "en" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("No product limit on script length (AC04)", () => {
  it("does not reject a script far longer than the 1500-word reference", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Long Script", script: LONG_SCRIPT, language: "en" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("A language from the supported list is required (AC05)", () => {
  it("refuses a request with no language", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "No Language", script: "some script" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a language outside the hardcoded list even submitted directly (Decision 5)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Bad Language", script: "some script", language: "klingon" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("exposes the supported language list for the frontend to consume (Decision 5)", async () => {
    const res = await app.inject({ method: "GET", url: "/languages" });
    expect(res.statusCode).toBe(200);
    const codes = res.json().map((l: { code: string }) => l.code);
    expect(codes).toEqual([...SUPPORTED_LANGUAGE_CODES]);
  });
});

describe("The stored script is exactly what was submitted (Decision 1)", () => {
  it("stores the script byte-identical to the submission, untrimmed", async () => {
    const script = "  Leading and trailing space preserved.  ";
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Exact Script", script, language: "en" },
    });
    const sessionId = res.json().session.sessionId;
    expect(getRun(sessionId)!.script).toBe(script);
  });
});

describe("No provider is called and nothing leaves submitted (Decision 8)", () => {
  it("creates zero scenes and leaves the session in submitted", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "No Scenes", script: "some script", language: "en" },
    });
    const body = res.json();
    expect(body.session.state).toBe("submitted");
    expect(body.scenes).toEqual([]);
  });
});

describe("An infrastructure ceiling, when hit, reports its cause (Decision 6)", () => {
  it("names the cause rather than returning a generic error, for a script beyond the configured ceiling", async () => {
    const hugeScript = "x".repeat(60 * 1024 * 1024); // 60MB, beyond the configured 50MB bodyLimit
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Huge", script: hugeScript, language: "en" },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toBeTruthy();
  });
});
