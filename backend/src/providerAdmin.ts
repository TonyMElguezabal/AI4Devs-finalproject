import { ulid } from "./util/ulid.ts";
import { SEGMENTATION_LOWER_BOUND_SECONDS, LEGACY_IMAGE_PROVIDER_IDENTIFIER, LEGACY_VIDEO_PROVIDER_IDENTIFIER } from "./config/providers.ts";
import { db } from "./db.ts";
import { clearProfileKey, keyStatusOf, storeProfileKey, type KeyStatus } from "./keyStore.ts";
import {
  activeProfileIdOf,
  ensureProfiles,
  getProfile,
  insertProfile,
  listProfiles,
  removeProfile,
  retireProfile,
  updateProfile,
  type ProviderProfile,
} from "./providerProfiles.ts";
import { SEEDED_PROFILES, getAdapterType, validateProviderParameters, type ParameterProblem, type ProviderStage } from "./providerTypes.ts";

// manage-providers-from-admin (JOS-218), design Decisions 6, 7 and 9 — what the Administrator may do with provider
// profiles, with the rules in one place so the routes stay thin.

export interface ProfileView extends KeyStatus {
  id: string;
  stage: ProviderStage;
  adapterType: string;
  label: string;
  parameters: Record<string, unknown>;
  usable: boolean;
  problems: ParameterProblem[];
  active: boolean;
  retired: boolean;
}

const NO_KEY_PROBLEM: ParameterProblem = { field: "apiKey", message: "apiKey: no API key is stored or found for this provider" };

/** Why a stored profile cannot be used for a request: invalid parameters, the video cross-check, or no key. */
export function profileProblems(profile: ProviderProfile): ParameterProblem[] {
  const problems: ParameterProblem[] = [];
  const parameters = validateProviderParameters(profile.adapterType, profile.parameters);
  if (!parameters.ok) problems.push(...parameters.problems);
  else problems.push(...videoCrossCheck(profile.adapterType, parameters.parameters));
  if (keyStatusOf(profile.id).keyStatus === "missing") problems.push(NO_KEY_PROBLEM);
  return problems;
}

/** The rule the settings apply at start-up (JOS-174), applied at save time: the shortest clip may not exceed the segmentation lower bound. */
function videoCrossCheck(adapterType: string, parameters: Record<string, unknown>): ParameterProblem[] {
  if (adapterType !== "runninghub-video") return [];
  const range = parameters.admittedDurationSeconds as { min: number; max: number };
  return range.min > SEGMENTATION_LOWER_BOUND_SECONDS
    ? [{ field: "admittedDurationSeconds.min", message: `admittedDurationSeconds.min: must not be longer than the ${SEGMENTATION_LOWER_BOUND_SECONDS} s segmentation lower bound` }]
    : [];
}

export function toView(profile: ProviderProfile): ProfileView {
  const problems = profileProblems(profile);
  return {
    id: profile.id,
    stage: profile.stage,
    adapterType: profile.adapterType,
    label: profile.label,
    parameters: profile.parameters,
    ...keyStatusOf(profile.id),
    usable: problems.length === 0 && profile.retiredAt === null,
    problems,
    active: profile.retiredAt === null && activeProfileIdOf(profile.stage) === profile.id,
    retired: profile.retiredAt !== null,
  };
}

export function listProfileViews(): ProfileView[] {
  ensureProfiles();
  return listProfiles().map(toView);
}

export type SaveResult = { ok: true; profile: ProfileView } | { ok: false; kind: "invalid"; problems: ParameterProblem[] } | { ok: false; kind: "not-found" };

function labelProblem(stage: ProviderStage, label: string, selfId?: string): ParameterProblem | undefined {
  if (label.trim() === "") return { field: "label", message: "label: must not be empty" };
  const taken = listProfiles().some((profile) => profile.stage === stage && profile.id !== selfId && profile.label.trim().toLowerCase() === label.trim().toLowerCase());
  return taken ? { field: "label", message: `label: another ${stage} provider already has this name` } : undefined;
}

export function createProfile(input: { stage: ProviderStage; adapterType: string; label: string; parameters: unknown; apiKey?: string }, now: () => Date = () => new Date()): SaveResult {
  ensureProfiles();
  const problems: ParameterProblem[] = [];
  const type = getAdapterType(input.adapterType);
  if (type && type.stage !== input.stage) {
    problems.push({ field: "adapterType", message: `adapterType: the ${input.stage} stage does not ship this adapter type` });
  } else {
    const parameters = validateProviderParameters(input.adapterType, input.parameters);
    if (!parameters.ok) problems.push(...parameters.problems);
    else problems.push(...videoCrossCheck(input.adapterType, parameters.parameters));
  }
  const label = labelProblem(input.stage, input.label);
  if (label) problems.push(label);
  if (problems.length > 0) return { ok: false, kind: "invalid", problems: problems.sort((a, b) => a.field.localeCompare(b.field)) };

  const parameters = validateProviderParameters(input.adapterType, input.parameters);
  if (!parameters.ok) throw new Error("unreachable: parameters were validated above");
  const id = ulid();
  insertProfile({ id, stage: input.stage, adapterType: input.adapterType, label: input.label.trim(), parameters: parameters.parameters }, now().toISOString());
  if (input.apiKey) storeProfileKey(id, input.apiKey);
  return { ok: true, profile: toView(getProfile(id)!) };
}

export function editProfile(id: string, input: { label: string; parameters: unknown; apiKey?: string }, now: () => Date = () => new Date()): SaveResult {
  ensureProfiles();
  const profile = getProfile(id);
  if (!profile) return { ok: false, kind: "not-found" };
  const problems: ParameterProblem[] = [];
  const parameters = validateProviderParameters(profile.adapterType, input.parameters);
  if (!parameters.ok) problems.push(...parameters.problems);
  else problems.push(...videoCrossCheck(profile.adapterType, parameters.parameters));
  const label = labelProblem(profile.stage, input.label, id);
  if (label) problems.push(label);
  if (problems.length > 0 || !parameters.ok) return { ok: false, kind: "invalid", problems: problems.sort((a, b) => a.field.localeCompare(b.field)) };

  updateProfile(id, { label: input.label.trim(), parameters: parameters.parameters }, now().toISOString());
  if (input.apiKey) storeProfileKey(id, input.apiKey);
  return { ok: true, profile: toView(getProfile(id)!) };
}

/** An earlier build stored the image model and the video endpoint for the seeded profiles; those bindings count for them too. */
function bindingIds(profile: ProviderProfile): string[] {
  const ids = [profile.id];
  if (profile.id === SEEDED_PROFILES.image.id) ids.push(LEGACY_IMAGE_PROVIDER_IDENTIFIER);
  if (profile.id === SEEDED_PROFILES.video.id) ids.push(LEGACY_VIDEO_PROVIDER_IDENTIFIER);
  return ids;
}

function isReferenced(profile: ProviderProfile): boolean {
  const ids = bindingIds(profile);
  const marks = ids.map(() => "?").join(", ");
  // Each query repeats the id list once per column it checks.
  const queries: Array<[string, number]> = [
    [`SELECT 1 FROM runs WHERE voice_provider_id IN (${marks}) OR decomposition_provider_id IN (${marks}) OR alignment_provider_id IN (${marks}) LIMIT 1`, 3],
    [`SELECT 1 FROM scenes WHERE provider IN (${marks}) OR video_provider IN (${marks}) LIMIT 1`, 2],
    [`SELECT 1 FROM stage_attempts WHERE provider_id IN (${marks}) LIMIT 1`, 1],
  ];
  return queries.some(([sql, times]) => db.prepare(sql).get(...Array.from({ length: times }, () => ids).flat()) !== undefined);
}

export type DeleteResult = { ok: true; result: "removed" | "retired" } | { ok: false; kind: "not-found" } | { ok: false; kind: "active"; stage: ProviderStage };

export function deleteProfile(id: string, now: () => Date = () => new Date()): DeleteResult {
  ensureProfiles();
  const profile = getProfile(id);
  if (!profile) return { ok: false, kind: "not-found" };
  if (profile.retiredAt === null && activeProfileIdOf(profile.stage) === id) return { ok: false, kind: "active", stage: profile.stage };
  if (profile.retiredAt === null && isReferenced(profile)) {
    retireProfile(id, now().toISOString());
    return { ok: true, result: "retired" };
  }
  if (profile.retiredAt !== null) return { ok: true, result: "retired" };
  clearProfileKey(id);
  removeProfile(id);
  return { ok: true, result: "removed" };
}
