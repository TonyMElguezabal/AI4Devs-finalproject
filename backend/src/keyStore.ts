import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { LEGACY_IMAGE_PROVIDER_IDENTIFIER, LEGACY_VIDEO_PROVIDER_IDENTIFIER } from "./config/providers.ts";
import { loadCredential } from "./config/credentials.ts";
import { db, getActiveProviderChoice, onStoreReset } from "./db.ts";
import { ensureProfiles, getProfile } from "./providerProfiles.ts";
import { SEEDED_PROFILES, type ProviderStage } from "./providerTypes.ts";

// manage-providers-from-admin (JOS-218), design Decision 5 — an API key entered on /admin is stored encrypted in the
// database (AES-256-GCM, a new IV on every write); the 32-byte master key is a separate file with mode 0600 and is
// never in the database, the repository or a log. Protection is against the database being copied or shared on its
// own: someone who can read both the database and the key file can decrypt.
//
// The rest of the application asks for a key by stage role (`stageApiKey`) and never names a vendor key. The vendor
// names below are the fallback for the five profiles created from the first settings, so a key already in the
// environment or the local secrets file keeps working without being entered again.

const ROLE_NAMES: Record<ProviderStage, string> = {
  reasoning: "REASONING_APIKEY",
  voice: "VOICE_OVER_APIKEY",
  alignment: "ALIGNMENT_APIKEY",
  image: "IMAGE_APIKEY",
  video: "VIDEO_APIKEY",
};

const LEGACY_CREDENTIAL_NAMES: Record<ProviderStage, string> = {
  reasoning: "OPENAI_KEY",
  voice: "ELEVENLABS_KEY",
  alignment: "ELEVENLABS_KEY",
  image: "FAL_API_KEY",
  video: "RUNNINGHUB_API_KEY",
};

const DEFAULT_MASTER_KEY_PATH = "data/provider-keys.key";

let cachedMasterKey: { path: string; key: Buffer } | undefined;
let legacyCredentialLoader: (name: string) => string = (name) => loadCredential(name);

/** Test seam: the environment and secrets-file lookup used for the first profiles. */
export function setLegacyCredentialLoader(loader: (name: string) => string): void {
  legacyCredentialLoader = loader;
}

export function resetKeyStoreCache(): void {
  cachedMasterKey = undefined;
}

onStoreReset(resetKeyStoreCache);

function masterKey(): Buffer {
  const path = resolve(process.env.PROVIDER_KEY_PATH ?? DEFAULT_MASTER_KEY_PATH);
  if (cachedMasterKey?.path === path) return cachedMasterKey.key;
  let key: Buffer;
  if (existsSync(path)) {
    key = readFileSync(path);
    if (key.length !== 32) throw new Error("the provider master key file is unreadable; stored provider keys cannot be decrypted");
  } else {
    key = randomBytes(32);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, key, { mode: 0o600, flag: "wx" });
  }
  cachedMasterKey = { path, key };
  return key;
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

function decrypt(blob: string): string {
  const raw = Buffer.from(blob, "base64");
  try {
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && /master key/.test(error.message)) throw error;
    throw new Error("a stored provider key could not be decrypted");
  }
}

function storedBlob(profileId: string): string | null {
  const row = db.prepare("SELECT api_key_encrypted AS k FROM provider_profiles WHERE id = ?").get(profileId) as { k: string | null } | undefined;
  return row?.k ?? null;
}

export function storeProfileKey(profileId: string, key: string): void {
  db.prepare("UPDATE provider_profiles SET api_key_encrypted = ?, updated_at = ? WHERE id = ?").run(encrypt(key), new Date().toISOString(), profileId);
}

export function clearProfileKey(profileId: string): void {
  db.prepare("UPDATE provider_profiles SET api_key_encrypted = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), profileId);
}

/** A binding written by an earlier build names the image model or the video endpoint; both mean the seeded profile. */
export function resolveProfileId(stage: ProviderStage, id: string): string {
  if (getProfile(id)) return id;
  if (stage === "image" && id === LEGACY_IMAGE_PROVIDER_IDENTIFIER) return SEEDED_PROFILES.image.id;
  if (stage === "video" && id === LEGACY_VIDEO_PROVIDER_IDENTIFIER) return SEEDED_PROFILES.video.id;
  return id;
}

function missingKeyError(stage: ProviderStage): Error {
  return new Error(`missing API key for the ${stage} role (${ROLE_NAMES[stage]}): enter it on /admin, or set it in the local environment or the local secrets file for the provider created from the settings`);
}

/** The legacy value, only for the profile created from the first settings of its stage; `undefined` when there is none. */
function legacyKey(profileId: string, stage: ProviderStage): string | undefined {
  if (SEEDED_PROFILES[stage].id !== profileId) return undefined;
  try {
    return legacyCredentialLoader(LEGACY_CREDENTIAL_NAMES[stage]);
  } catch {
    return undefined;
  }
}

/** The key of a profile: the stored one, else the legacy environment or secrets value of a seeded profile. */
export function keyFor(profileId: string): string {
  ensureProfiles();
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`unknown provider profile "${profileId}"`);
  const blob = storedBlob(profileId);
  if (blob !== null) return decrypt(blob);
  const legacy = legacyKey(profileId, profile.stage);
  if (legacy !== undefined) return legacy;
  throw missingKeyError(profile.stage);
}

/**
 * The provider a stage uses for a new request: the Administrator's choice when it is a profile that is not retired,
 * else the profile created from the settings. The same answer `activeProviderId` gives, kept free of the adapter
 * registries so the adapters can load their keys through this module without an import cycle.
 */
function activeProfileId(stage: ProviderStage): string {
  const choice = getActiveProviderChoice(stage);
  const profile = choice === null ? undefined : getProfile(choice);
  return profile && profile.stage === stage && profile.retiredAt === null ? profile.id : SEEDED_PROFILES[stage].id;
}

/** The one entry point the application uses: the key of the profile the stage instance is bound to, else of the active one. */
export function stageApiKey(stage: ProviderStage, boundId?: string): string {
  return keyFor(resolveProfileId(stage, boundId ?? activeProfileId(stage)));
}

export interface KeyStatus {
  keyStatus: "stored" | "environment" | "missing";
  /** The last four characters of a stored key of at least 12 characters. */
  keyHint: string | null;
}

export function keyStatusOf(profileId: string): KeyStatus {
  ensureProfiles();
  const profile = getProfile(profileId);
  if (!profile) return { keyStatus: "missing", keyHint: null };
  const blob = storedBlob(profileId);
  if (blob !== null) {
    const key = decrypt(blob);
    return { keyStatus: "stored", keyHint: key.length >= 12 ? key.slice(-4) : null };
  }
  return legacyKey(profileId, profile.stage) !== undefined ? { keyStatus: "environment", keyHint: null } : { keyStatus: "missing", keyHint: null };
}
