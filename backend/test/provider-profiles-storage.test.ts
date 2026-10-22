import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS } from "../src/config/providers.ts";
import { applyMigrationsTo, resetAll } from "../src/db.ts";
import { getProfile, listProfiles, seedProviderProfiles } from "../src/providerProfiles.ts";

// manage-providers-from-admin (JOS-218), group 2 — design Decisions 1 and 8: the `provider_profiles` table and the
// first profiles, created from the settings with the identifiers the database already stores.

describe("provider_profiles migration", () => {
  it("creates the table with the columns of Decision 1 and inserts no rows", () => {
    const target = new DatabaseSync(":memory:");
    target.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    `);
    applyMigrationsTo(target);
    const columns = (target.prepare("PRAGMA table_info(provider_profiles)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(["id", "stage", "adapter_type", "label", "parameters", "api_key_encrypted", "retired_at", "created_at", "updated_at"]);
    expect((target.prepare("SELECT COUNT(*) AS n FROM provider_profiles").get() as { n: number }).n).toBe(0);
  });
});

beforeEach(() => resetAll());
afterEach(() => vi.restoreAllMocks());

describe("seedProviderProfiles", () => {
  it("creates one profile per stage with the stored id, the stage's adapter type, the label and the parameters without the name", () => {
    seedProviderProfiles(SETTINGS);

    expect(listProfiles().map((profile) => [profile.stage, profile.id, profile.adapterType, profile.label])).toEqual([
      ["reasoning", "openai-decomposition", "openai-reasoning", SETTINGS.decomposition.name],
      ["voice", "ElevenLabs", "elevenlabs-voice", SETTINGS.voice.name],
      ["alignment", "elevenlabs-forced-alignment", "elevenlabs-alignment", SETTINGS.alignment.name],
      ["image", "Fal.ai", "fal-image", SETTINGS.image.name],
      ["video", "RunningHub", "runninghub-video", SETTINGS.video.name],
    ]);
    const { name: _voiceName, ...voiceParameters } = SETTINGS.voice;
    expect(getProfile("ElevenLabs")!.parameters).toEqual(voiceParameters);
    const { name: _videoName, ...videoParameters } = SETTINGS.video;
    expect(getProfile("RunningHub")!.parameters).toEqual(videoParameters);
    expect(getProfile("Fal.ai")!.hasStoredKey).toBe(false);
  });

  it("changes nothing on a second call", () => {
    seedProviderProfiles(SETTINGS);
    const before = JSON.stringify(listProfiles());
    seedProviderProfiles(SETTINGS);
    expect(JSON.stringify(listProfiles())).toBe(before);
  });

  it("keeps the stored profile and logs one notice when a provider section of the settings changed after the first start", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    seedProviderProfiles(SETTINGS);
    const changed = { ...SETTINGS, image: { ...SETTINGS.image, model: "another/model" } };

    seedProviderProfiles(changed);
    seedProviderProfiles(changed);

    expect(getProfile("Fal.ai")!.parameters).toEqual({ model: SETTINGS.image.model });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("/admin");
  });

  it("does not seed a stage that already has a profile, even a retired one", () => {
    seedProviderProfiles(SETTINGS);
    db_retire("Fal.ai");
    seedProviderProfiles(SETTINGS);
    expect(listProfiles().filter((profile) => profile.stage === "image")).toHaveLength(1);
  });
});

import { retireProfile } from "../src/providerProfiles.ts";
function db_retire(id: string): void {
  retireProfile(id, "2026-10-21T00:00:00.000Z");
}
