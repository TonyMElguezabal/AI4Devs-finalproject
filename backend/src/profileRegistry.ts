import type { ProviderRegistry } from "./activeProvider.ts";
import { LEGACY_IMAGE_PROVIDER_IDENTIFIER, LEGACY_VIDEO_PROVIDER_IDENTIFIER } from "./config/providers.ts";
import { ensureProfiles, listProfiles, profilesVersion, type ProviderProfile } from "./providerProfiles.ts";
import { SEEDED_PROFILES, type ProviderStage } from "./providerTypes.ts";

// manage-providers-from-admin (JOS-218), design Decision 3 — the default registry of a stage is built from its
// provider profiles and rebuilt when a profile changes; it is cached until the profiles' version moves, so a bind or a
// listing costs no rebuild and an edited parameter reaches the next resolution without a restart.

/** The keys an earlier build stored for the seeded image and video profiles; they resolve to those profiles' adapters. */
const LEGACY_ALIASES: Partial<Record<ProviderStage, string>> = {
  image: LEGACY_IMAGE_PROVIDER_IDENTIFIER,
  video: LEGACY_VIDEO_PROVIDER_IDENTIFIER,
};

export function buildProfileRegistry<Adapter>(
  stage: ProviderStage,
  makeAdapter: (profile: ProviderProfile) => Adapter,
): ProviderRegistry<Adapter> {
  ensureProfiles();
  const profiles = listProfiles().filter((profile) => profile.stage === stage);
  const adapters: Record<string, Adapter> = {};
  const labels: Record<string, string> = {};
  for (const profile of profiles) {
    adapters[profile.id] = makeAdapter(profile);
    labels[profile.id] = profile.label;
  }
  const seededId = SEEDED_PROFILES[stage].id;
  const alias = LEGACY_ALIASES[stage];
  if (alias && adapters[seededId]) adapters[alias] = adapters[seededId];
  const usable = profiles.filter((profile) => profile.retiredAt === null);
  const defaultIdentifier = usable.some((profile) => profile.id === seededId) ? seededId : (usable[0]?.id ?? seededId);
  return {
    defaultIdentifier,
    adapters,
    labels,
    ...(alias && adapters[alias] ? { aliases: [alias] } : {}),
    retired: profiles.filter((profile) => profile.retiredAt !== null).map((profile) => profile.id),
  };
}

/** A lazily built registry that is rebuilt when the profiles change, and that a test can replace. */
export function profileRegistrySlot<Adapter, Registry extends ProviderRegistry<Adapter>>(build: () => Registry) {
  let override: Registry | undefined;
  let cached: { version: number; registry: Registry } | undefined;
  return {
    get(): Registry {
      if (override) return override;
      const version = profilesVersion();
      if (!cached || cached.version !== version) cached = { version, registry: build() };
      return cached.registry;
    },
    set(next: Registry): void {
      override = next;
    },
    reset(): void {
      override = undefined;
      cached = undefined;
    },
  };
}
