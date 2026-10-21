import { getActiveProviderChoice, upsertActiveProviderChoice } from "./db.ts";
import { getAlignmentProviderRegistry, getReasoningProviderRegistry } from "./decompositionDependencies.ts";
import { getImageProviderRegistry } from "./imageProvider.ts";
import { getVideoProviderRegistry } from "./videoProvider.ts";
import { getVoiceProviderRegistry } from "./voiceProvider.ts";

// change-active-provider-from-admin (JOS-171), design Decisions 1 and 2 — one function decides the provider every
// stage binds to on its first attempt: the Administrator's choice when it names a shipped adapter, else the
// registry's settings default. It reads SQLite on every call, so a change applies to the next bind with no restart.

export const PROVIDER_STAGES = ["reasoning", "voice", "alignment", "image", "video"] as const;
export type ProviderStage = (typeof PROVIDER_STAGES)[number];

/** The shape every stage's adapter registry shares. `aliases` resolve but are never offered as a choice. */
export interface ProviderRegistry<Adapter> {
  defaultIdentifier: string;
  adapters: Record<string, Adapter>;
  labels?: Record<string, string>;
  aliases?: readonly string[];
}

export function registryFor(stage: ProviderStage): ProviderRegistry<unknown> {
  switch (stage) {
    case "reasoning":
      return getReasoningProviderRegistry();
    case "voice":
      return getVoiceProviderRegistry();
    case "alignment":
      return getAlignmentProviderRegistry();
    case "image":
      return getImageProviderRegistry();
    case "video":
      return getVideoProviderRegistry();
  }
}

/** The adapters the Administrator may choose for the stage: every key but the aliases. */
export function selectableProviders(stage: ProviderStage): Array<{ id: string; label: string }> {
  const registry = registryFor(stage);
  const aliases = new Set(registry.aliases ?? []);
  return Object.keys(registry.adapters)
    .filter((id) => !aliases.has(id))
    .map((id) => ({ id, label: registry.labels?.[id] ?? id }));
}

/** A stored choice naming an adapter this build no longer ships (after an update), or `null` when there is none or it still resolves. */
export function orphanedChoice(stage: ProviderStage): string | null {
  const choice = getActiveProviderChoice(stage);
  return choice !== null && !selectableProviders(stage).some((provider) => provider.id === choice) ? choice : null;
}

const warnedOrphans = new Set<string>();

export function activeProviderId(stage: ProviderStage): string {
  const registry = registryFor(stage);
  const choice = getActiveProviderChoice(stage);
  if (choice === null) return registry.defaultIdentifier;
  if (selectableProviders(stage).some((provider) => provider.id === choice)) return choice;
  const key = `${stage}:${choice}`;
  if (!warnedOrphans.has(key)) {
    warnedOrphans.add(key);
    console.warn(`The active ${stage} provider "${choice}" chosen on /admin is not shipped by this build; using the settings default "${registry.defaultIdentifier}".`);
  }
  return registry.defaultIdentifier;
}

/** Throws for a provider the stage does not ship, so a request naming one changes nothing. */
export function setActiveProvider(stage: ProviderStage, providerId: string, now: () => Date = () => new Date()): void {
  if (!selectableProviders(stage).some((provider) => provider.id === providerId)) {
    throw new Error(`"${providerId}" is not a ${stage} provider this build ships.`);
  }
  upsertActiveProviderChoice(stage, providerId, now().toISOString());
}
