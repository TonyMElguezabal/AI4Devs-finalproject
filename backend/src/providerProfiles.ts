import type { Settings } from "./config/settings.ts";
import { db, onStoreReset } from "./db.ts";
import { PROVIDER_STAGES, SEEDED_PROFILES, type ProviderStage } from "./providerTypes.ts";

// manage-providers-from-admin (JOS-218), design Decisions 1, 7 and 8 — the provider profiles stored in the database,
// and the first ones, seeded from the settings with the identifiers the database already stores in its bindings.

export interface ProviderProfile {
  id: string;
  stage: ProviderStage;
  adapterType: string;
  label: string;
  parameters: Record<string, unknown>;
  /** Whether an encrypted key is stored. The key itself never leaves the key store. */
  hasStoredKey: boolean;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProfileRow {
  id: string;
  stage: string;
  adapter_type: string;
  label: string;
  parameters: string;
  api_key_encrypted: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
}

function toProfile(row: ProfileRow): ProviderProfile {
  return {
    id: row.id,
    stage: row.stage as ProviderStage,
    adapterType: row.adapter_type,
    label: row.label,
    parameters: JSON.parse(row.parameters) as Record<string, unknown>,
    hasStoredKey: row.api_key_encrypted !== null,
    retiredAt: row.retired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every profile, in stage order and then creation order. */
export function listProfiles(): ProviderProfile[] {
  const rows = db.prepare("SELECT * FROM provider_profiles ORDER BY created_at, id").all() as unknown as ProfileRow[];
  return rows.map(toProfile).sort((a, b) => PROVIDER_STAGES.indexOf(a.stage) - PROVIDER_STAGES.indexOf(b.stage));
}

export function getProfile(id: string): ProviderProfile | undefined {
  const row = db.prepare("SELECT * FROM provider_profiles WHERE id = ?").get(id) as unknown as ProfileRow | undefined;
  return row ? toProfile(row) : undefined;
}

export interface NewProfile {
  id: string;
  stage: ProviderStage;
  adapterType: string;
  label: string;
  parameters: Record<string, unknown>;
}

export function insertProfile(profile: NewProfile, now: string): void {
  db.prepare(
    "INSERT INTO provider_profiles (id, stage, adapter_type, label, parameters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(profile.id, profile.stage, profile.adapterType, profile.label, JSON.stringify(profile.parameters), now, now);
}

export function updateProfile(id: string, change: { label: string; parameters: Record<string, unknown> }, now: string): void {
  db.prepare("UPDATE provider_profiles SET label = ?, parameters = ?, updated_at = ? WHERE id = ?").run(change.label, JSON.stringify(change.parameters), now, id);
}

/** A retired profile is no longer offered but still serves what is bound to it (Decision 7). */
export function retireProfile(id: string, now: string): void {
  db.prepare("UPDATE provider_profiles SET retired_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
}

export function removeProfile(id: string): void {
  db.prepare("DELETE FROM provider_profiles WHERE id = ?").run(id);
}

/** The stage the settings call "decomposition" is the reasoning stage everywhere else. */
function settingsSection(settings: Settings, stage: ProviderStage): { name: string } & Record<string, unknown> {
  return stage === "reasoning" ? settings.decomposition : settings[stage];
}

const warnedDrift = new Set<ProviderStage>();

/**
 * Creates the first profile of every stage that has none, from the provider section of the settings. Afterwards the
 * sections no longer change a profile: when one differs from the stored profile, one notice says `/admin` owns it.
 */
export function seedProviderProfiles(settings: Settings, now: () => Date = () => new Date()): void {
  for (const stage of PROVIDER_STAGES) {
    const { name, ...parameters } = settingsSection(settings, stage);
    const seeded = SEEDED_PROFILES[stage];
    const existing = listProfiles().filter((profile) => profile.stage === stage);
    if (existing.length === 0) {
      insertProfile({ id: seeded.id, stage, adapterType: seeded.adapterType, label: name, parameters }, now().toISOString());
      continue;
    }
    const first = existing.find((profile) => profile.id === seeded.id);
    if (first && JSON.stringify(first.parameters) !== JSON.stringify(parameters) && !warnedDrift.has(stage)) {
      warnedDrift.add(stage);
      console.warn(`The ${stage} provider section of the settings differs from the provider stored on /admin; the stored provider is used. Provider settings are managed on /admin.`);
    }
  }
}

// A test reset starts the drift notices again.
onStoreReset(() => warnedDrift.clear());
