import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SETTINGS } from "../src/config/providers.ts";
import { resetAll } from "../src/db.ts";
import { resetKeyStoreCache, setLegacyCredentialLoader, storeProfileKey } from "../src/keyStore.ts";
import { seedProviderProfiles } from "../src/providerProfiles.ts";
import { createOpenAiScriptModerator } from "../src/scriptModeration.ts";
import { loadCredential } from "../src/config/credentials.ts";

// manage-providers-from-admin (JOS-218), design Decision 11 — script moderation uses the active reasoning provider's key.

let folder: string;
const authorizations: Array<string | null> = [];
const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
  authorizations.push(new Headers(init?.headers).get("authorization"));
  return new Response(JSON.stringify({ results: [{ flagged: false, categories: {} }] }), { status: 200 });
}) as typeof fetch;

beforeEach(() => {
  resetAll();
  seedProviderProfiles(SETTINGS);
  folder = mkdtempSync(join(tmpdir(), "vid4you-moderation-"));
  process.env.PROVIDER_KEY_PATH = join(folder, "provider-keys.key");
  resetKeyStoreCache();
  authorizations.length = 0;
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
  delete process.env.PROVIDER_KEY_PATH;
  delete process.env.OPENAI_KEY;
  setLegacyCredentialLoader(loadCredential);
  resetKeyStoreCache();
});

describe("script moderation key", () => {
  it("uses the key stored for the active reasoning profile, with no OPENAI_KEY in the environment", async () => {
    delete process.env.OPENAI_KEY;
    storeProfileKey("openai-decomposition", "stored-reasoning-key-1");
    await createOpenAiScriptModerator({ fetchFn }).moderate("A harmless script.");
    expect(authorizations).toEqual(["Bearer stored-reasoning-key-1"]);
  });

  it("falls back to the legacy environment key of the seeded reasoning profile", async () => {
    process.env.OPENAI_KEY = "from-the-environment";
    await createOpenAiScriptModerator({ fetchFn }).moderate("A harmless script.");
    expect(authorizations).toEqual(["Bearer from-the-environment"]);
  });
});
