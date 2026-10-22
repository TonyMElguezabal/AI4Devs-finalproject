import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SETTINGS } from "../src/config/providers.ts";
import { db, resetAll } from "../src/db.ts";
import { insertProfile, seedProviderProfiles } from "../src/providerProfiles.ts";
import { loadCredential } from "../src/config/credentials.ts";
import { clearProfileKey, keyFor, keyStatusOf, resetKeyStoreCache, setLegacyCredentialLoader, stageApiKey, storeProfileKey } from "../src/keyStore.ts";

// manage-providers-from-admin (JOS-218), group 3 — design Decision 5: keys encrypted in the database with a master key
// kept in a separate file, and resolved by stage role.

const KEY = "sk-example-1234567890ab";
let folder: string;
let secretsPath: string;
const environmentBefore = { ...process.env };

beforeEach(() => {
  resetAll();
  folder = mkdtempSync(join(tmpdir(), "vid4you-keys-"));
  process.env.PROVIDER_KEY_PATH = join(folder, "provider-keys.key");
  secretsPath = join(folder, "secrets.json");
  setLegacyCredentialLoader((name) => loadCredential(name, { secretsPath }));
  for (const name of ["FAL_API_KEY", "ELEVENLABS_KEY", "OPENAI_KEY", "RUNNINGHUB_API_KEY"]) delete process.env[name];
  resetKeyStoreCache();
  seedProviderProfiles(SETTINGS);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
  for (const name of ["PROVIDER_KEY_PATH", "FAL_API_KEY", "ELEVENLABS_KEY", "OPENAI_KEY", "RUNNINGHUB_API_KEY"]) {
    if (environmentBefore[name] === undefined) delete process.env[name];
    else process.env[name] = environmentBefore[name];
  }
  resetKeyStoreCache();
  setLegacyCredentialLoader(loadCredential);
});

const storedBlob = (id: string) => (db.prepare("SELECT api_key_encrypted AS k FROM provider_profiles WHERE id = ?").get(id) as { k: string | null }).k;

describe("the encrypted key store", () => {
  it("does not keep the key in clear text in the database, and reads it back", () => {
    storeProfileKey("Fal.ai", KEY);
    expect(storedBlob("Fal.ai")).not.toBeNull();
    expect(storedBlob("Fal.ai")).not.toContain(KEY);
    expect(keyFor("Fal.ai")).toBe(KEY);
  });

  it("uses a new IV on every write", () => {
    storeProfileKey("Fal.ai", KEY);
    const first = storedBlob("Fal.ai");
    storeProfileKey("Fal.ai", KEY);
    expect(storedBlob("Fal.ai")).not.toBe(first);
  });

  it("creates the master key file with mode 0600 and reuses it", () => {
    storeProfileKey("Fal.ai", KEY);
    const path = process.env.PROVIDER_KEY_PATH!;
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path)).toHaveLength(32);
    const master = readFileSync(path);
    resetKeyStoreCache();
    storeProfileKey("ElevenLabs", "another-key-value-123");
    expect(readFileSync(path).equals(master)).toBe(true);
    expect(keyFor("Fal.ai")).toBe(KEY);
  });

  it("fails on a tampered ciphertext without printing the key", () => {
    storeProfileKey("Fal.ai", KEY);
    const blob = storedBlob("Fal.ai")!;
    const raw = Buffer.from(blob, "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    db.prepare("UPDATE provider_profiles SET api_key_encrypted = ? WHERE id = 'Fal.ai'").run(raw.toString("base64"));
    expect(() => keyFor("Fal.ai")).toThrow();
    try {
      keyFor("Fal.ai");
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(KEY);
    }
  });

  it("fails without printing a value when the master key is unreadable", () => {
    storeProfileKey("Fal.ai", KEY);
    writeFileSync(process.env.PROVIDER_KEY_PATH!, Buffer.alloc(5));
    resetKeyStoreCache();
    expect(() => keyFor("Fal.ai")).toThrow(/master key/i);
  });

  it("clears a stored key", () => {
    storeProfileKey("Fal.ai", KEY);
    clearProfileKey("Fal.ai");
    expect(storedBlob("Fal.ai")).toBeNull();
  });
});

describe("keyFor", () => {
  it("prefers the stored key over the legacy environment name", () => {
    process.env.FAL_API_KEY = "from-the-environment";
    storeProfileKey("Fal.ai", KEY);
    expect(keyFor("Fal.ai")).toBe(KEY);
  });

  it("falls back to the legacy environment name for a seeded profile", () => {
    process.env.FAL_API_KEY = "from-the-environment";
    expect(keyFor("Fal.ai")).toBe("from-the-environment");
  });

  it("falls back to the secrets file after the environment", () => {
    writeFileSync(secretsPath, JSON.stringify({ RUNNINGHUB_API_KEY: "from-the-file" }));
    expect(keyFor("RunningHub")).toBe("from-the-file");
  });

  it("has no fallback for a profile added on /admin", () => {
    process.env.FAL_API_KEY = "from-the-environment";
    insertProfile({ id: "01ADDED", stage: "image", adapterType: "fal-image", label: "Flux pro", parameters: { model: "fal-ai/flux-pro" } }, "2026-10-21T00:00:00.000Z");
    expect(() => keyFor("01ADDED")).toThrow(/image/);
  });

  it("names the stage role, never a value, when there is no key", () => {
    expect(() => keyFor("Fal.ai")).toThrow(/IMAGE_APIKEY/);
    expect(() => keyFor("ElevenLabs")).toThrow(/VOICE_OVER_APIKEY/);
    expect(() => keyFor("openai-decomposition")).toThrow(/REASONING_APIKEY/);
    expect(() => keyFor("elevenlabs-forced-alignment")).toThrow(/ALIGNMENT_APIKEY/);
    expect(() => keyFor("RunningHub")).toThrow(/VIDEO_APIKEY/);
  });

  it("resolves a legacy image binding to the seeded profile", () => {
    storeProfileKey("Fal.ai", KEY);
    expect(stageApiKey("image", "fal-ai/flux/dev")).toBe(KEY);
  });
});

describe("stageApiKey", () => {
  it("answers with the key of the bound profile, whatever is active now", () => {
    insertProfile({ id: "01OTHER", stage: "image", adapterType: "fal-image", label: "Other", parameters: { model: "m" } }, "2026-10-21T00:00:00.000Z");
    storeProfileKey("Fal.ai", "key-of-a-1234567");
    storeProfileKey("01OTHER", "key-of-b-1234567");
    expect(stageApiKey("image", "Fal.ai")).toBe("key-of-a-1234567");
  });

  it("answers with the active profile's key when nothing is bound yet", () => {
    insertProfile({ id: "01OTHER", stage: "image", adapterType: "fal-image", label: "Other", parameters: { model: "m" } }, "2026-10-21T00:00:00.000Z");
    storeProfileKey("Fal.ai", "key-of-a-1234567");
    storeProfileKey("01OTHER", "key-of-b-1234567");
    expect(stageApiKey("image")).toBe("key-of-a-1234567");
  });
});

describe("keyStatusOf", () => {
  it("reports stored with the last four characters of a long key", () => {
    storeProfileKey("Fal.ai", KEY);
    expect(keyStatusOf("Fal.ai")).toEqual({ keyStatus: "stored", keyHint: "90ab" });
  });

  it("gives no hint for a key shorter than 12 characters", () => {
    storeProfileKey("Fal.ai", "short-key-1");
    expect(keyStatusOf("Fal.ai")).toEqual({ keyStatus: "stored", keyHint: null });
  });

  it("reports environment for a seeded profile that relies on the legacy name, and missing otherwise", () => {
    expect(keyStatusOf("Fal.ai")).toEqual({ keyStatus: "missing", keyHint: null });
    process.env.FAL_API_KEY = "from-the-environment";
    expect(keyStatusOf("Fal.ai")).toEqual({ keyStatus: "environment", keyHint: null });
  });

  it("never carries the key", () => {
    storeProfileKey("Fal.ai", KEY);
    expect(JSON.stringify(keyStatusOf("Fal.ai"))).not.toContain(KEY);
    expect(existsSync(process.env.PROVIDER_KEY_PATH!)).toBe(true);
  });
});
