import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo, createRun, db, getAppSettings, getRun, resetAll, saveVisualStylePrompt } from "../src/db.ts";

// admin-visual-style-prompt (JOS-201), group 2 — design Decisions 4 and 5: one settings row, copied onto each run at creation.

beforeEach(() => {
  resetAll();
  saveVisualStylePrompt("");
});

describe("Settings storage", () => {
  it("starts with an empty prompt and no reference image", () => {
    const settings = getAppSettings();
    expect(settings.visualStylePrompt).toBe("");
    expect(settings.referenceImage).toBeNull();
  });

  it("trims the prompt and moves updatedAt forward on a save", async () => {
    const before = getAppSettings().updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    saveVisualStylePrompt("  Warry, a 2D cartoon  ");
    const after = getAppSettings();
    expect(after.visualStylePrompt).toBe("Warry, a 2D cartoon");
    expect(after.updatedAt > before).toBe(true);
  });

  it("keeps exactly one settings row", () => {
    saveVisualStylePrompt("a");
    saveVisualStylePrompt("b");
    expect((db.prepare("SELECT COUNT(*) AS c FROM app_settings").get() as { c: number }).c).toBe(1);
  });
});

describe("Run snapshot", () => {
  it("copies the saved prompt onto a new run and exposes it", () => {
    saveVisualStylePrompt("style A");
    const run = createRun(randomUUID(), "Snapshot", "One. Two.", "en");
    expect(run.visualStylePrompt).toBe("style A");
    expect(getRun(run.id)!.visualStylePrompt).toBe("style A");
  });

  it("does not change an existing run when the prompt is saved again, and a later run gets the new text", () => {
    saveVisualStylePrompt("style A");
    const first = createRun(randomUUID(), "First", "One. Two.", "en");
    saveVisualStylePrompt("style B");
    const second = createRun(randomUUID(), "Second", "One. Two.", "en");
    expect(getRun(first.id)!.visualStylePrompt).toBe("style A");
    expect(getRun(second.id)!.visualStylePrompt).toBe("style B");
  });

  it("holds the empty string when no style is saved", () => {
    expect(createRun(randomUUID(), "Plain", "One. Two.", "en").visualStylePrompt).toBe("");
  });
});

describe("Migration 18", () => {
  it("gives existing runs an empty prompt and changes nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-style-migration-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-style.sqlite"));
      fixture.exec(`
        CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
      `);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('old', 'Old', '2026-01-01T00:00:00.000Z')").run();
      applyMigrationsTo(fixture, 17);

      expect(applyMigrationsTo(fixture, 18)).toEqual([18]);

      const row = fixture.prepare("SELECT * FROM runs WHERE id = 'old'").get() as Record<string, unknown>;
      expect(row.visual_style_prompt).toBe("");
      expect(row.title).toBe("Old");
      const settings = fixture.prepare("SELECT * FROM app_settings").all() as Array<Record<string, unknown>>;
      expect(settings).toHaveLength(1);
      expect(settings[0]).toMatchObject({ id: 1, visual_style_prompt: "", reference_image_path: null, reference_image_content_type: null });
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- group 4 — the routes (design Decision 6) ----

import { existsSync, readdirSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { APP_DATA_DIR, clearReferenceImage } from "../src/db.ts";
import { buildApp } from "../src/server.ts";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 8)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x40, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(100, 9)]);
const ADMIN_DIR = join(APP_DATA_DIR, "admin");

let app: FastifyInstance;

beforeEach(async () => {
  clearReferenceImage();
  rmSync(ADMIN_DIR, { recursive: true, force: true });
  app = await buildApp();
});

const putImage = (payload: Buffer, contentType: string | undefined) =>
  app.inject({ method: "PUT", url: "/admin/settings/reference-image", payload, headers: contentType ? { "content-type": contentType } : {} });
const putPrompt = (payload: unknown) => app.inject({ method: "PUT", url: "/admin/settings/visual-style-prompt", payload: payload as object });

describe("GET and PUT /admin/settings/visual-style-prompt", () => {
  it("reads a fresh database", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/settings" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ visualStylePrompt: "", referenceImage: null });
    expect(typeof res.json().updatedAt).toBe("string");
  });

  it("trims, saves and reads back a prompt, and accepts the empty prompt", async () => {
    const saved = await putPrompt({ visualStylePrompt: "  Warry, a 2D cartoon  " });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().visualStylePrompt).toBe("Warry, a 2D cartoon");
    expect((await app.inject({ method: "GET", url: "/admin/settings" })).json().visualStylePrompt).toBe("Warry, a 2D cartoon");
    expect((await putPrompt({ visualStylePrompt: "" })).json().visualStylePrompt).toBe("");
  });

  it("accepts exactly 8,000 characters and rejects 8,001 after trimming, saving nothing", async () => {
    expect((await putPrompt({ visualStylePrompt: "x".repeat(8000) })).statusCode).toBe(200);
    const tooLong = await putPrompt({ visualStylePrompt: `  ${"y".repeat(8001)}  ` });
    expect(tooLong.statusCode).toBe(400);
    expect(getAppSettings().visualStylePrompt).toBe("x".repeat(8000));
  });

  it("counts the trimmed length, so padding does not push a valid prompt over the limit", async () => {
    expect((await putPrompt({ visualStylePrompt: ` ${"z".repeat(8000)} ` })).statusCode).toBe(200);
  });

  it.each([["a missing field", {}], ["a non-string", { visualStylePrompt: 5 }]])("rejects %s with 400", async (_name, payload) => {
    expect((await putPrompt(payload)).statusCode).toBe(400);
  });
});

describe("The reference image routes", () => {
  it.each([
    ["image/png", PNG, ".png"],
    ["image/jpeg", JPEG, ".jpg"],
    ["image/webp", WEBP, ".webp"],
  ])("stores a valid %s and streams the same bytes back", async (contentType, bytes) => {
    const res = await putImage(bytes, contentType);
    expect(res.statusCode).toBe(200);
    expect(res.json().referenceImage).toMatchObject({ contentType, sizeBytes: bytes.length });
    const got = await app.inject({ method: "GET", url: "/admin/settings/reference-image" });
    expect(got.statusCode).toBe(200);
    expect(got.headers["content-type"]).toBe(contentType);
    expect(got.rawPayload.equals(bytes)).toBe(true);
  });

  it("never returns the stored path", async () => {
    await putImage(PNG, "image/png");
    const body = (await app.inject({ method: "GET", url: "/admin/settings" })).body;
    expect(body).not.toContain(APP_DATA_DIR);
    expect(body).not.toContain("reference-image.");
    expect(body).not.toContain("admin/");
  });

  it("stores a path relative to the app data directory", async () => {
    await putImage(PNG, "image/png");
    const stored = (db.prepare("SELECT reference_image_path AS p FROM app_settings").get() as { p: string }).p;
    expect(stored.startsWith("/")).toBe(false);
    expect(existsSync(join(APP_DATA_DIR, stored))).toBe(true);
  });

  it("rejects bytes that are not the declared type with 400 and keeps the previous image", async () => {
    await putImage(PNG, "image/png");
    const bad = await putImage(Buffer.from("this is not a png at all"), "image/png");
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/admin/settings/reference-image" })).rawPayload.equals(PNG)).toBe(true);
  });

  it.each([
    ["a GIF", Buffer.from("GIF89a-----"), "image/gif"],
    ["a missing content type", PNG, undefined],
    ["a text content type", PNG, "text/plain"],
  ])("rejects %s with 400 and keeps the previous image", async (_name, bytes, contentType) => {
    await putImage(JPEG, "image/jpeg");
    expect((await putImage(bytes, contentType)).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/admin/settings/reference-image" })).rawPayload.equals(JPEG)).toBe(true);
  });

  it("rejects an image over 5 MB with 413 and keeps the previous image", async () => {
    await putImage(PNG, "image/png");
    const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(6 * 1024 * 1024)]);
    expect((await putImage(big, "image/png")).statusCode).toBe(413);
    expect((await app.inject({ method: "GET", url: "/admin/settings/reference-image" })).rawPayload.equals(PNG)).toBe(true);
  });

  it("accepts an image of exactly 5 MB", async () => {
    const exact = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(5 * 1024 * 1024 - 8)]);
    expect((await putImage(exact, "image/png")).statusCode).toBe(200);
  });

  it("replaces an image of another type, removing the old file", async () => {
    await putImage(PNG, "image/png");
    const pngFiles = readdirSync(ADMIN_DIR);
    expect(pngFiles).toHaveLength(1);
    await putImage(JPEG, "image/jpeg");
    const files = readdirSync(ADMIN_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toBe(pngFiles[0]);
    expect((await app.inject({ method: "GET", url: "/admin/settings" })).json().referenceImage.contentType).toBe("image/jpeg");
  });

  it("leaves no temporary file behind after a rejected upload", async () => {
    await putImage(PNG, "image/png");
    await putImage(Buffer.from("not an image"), "image/png");
    expect(readdirSync(ADMIN_DIR)).toHaveLength(1);
  });

  it("answers 404 when there is no image", async () => {
    expect((await app.inject({ method: "GET", url: "/admin/settings/reference-image" })).statusCode).toBe(404);
  });

  it("deletes the file and the row fields, answering 204 every time", async () => {
    await putImage(PNG, "image/png");
    const delete1 = await app.inject({ method: "DELETE", url: "/admin/settings/reference-image" });
    expect(delete1.statusCode).toBe(204);
    expect(readdirSync(ADMIN_DIR)).toHaveLength(0);
    expect(getAppSettings().referenceImage).toBeNull();
    expect((await app.inject({ method: "DELETE", url: "/admin/settings/reference-image" })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/admin/settings/reference-image" })).statusCode).toBe(404);
  });
});
