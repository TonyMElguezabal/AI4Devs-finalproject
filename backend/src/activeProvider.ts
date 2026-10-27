import { getActiveProviderChoice, inTransaction, recordProviderChange, upsertActiveProviderChoice } from "./db.ts";
import { getAlignmentProviderRegistry, getReasoningProviderRegistry } from "./decompositionDependencies.ts";
import { getImageProviderRegistry } from "./imageProvider.ts";
import { getVideoProviderRegistry } from "./videoProvider.ts";
import { getVoiceProviderRegistry } from "./voiceProvider.ts";
import type { ProviderStage } from "./providerTypes.ts";

// change-active-provider-from-admin (JOS-171), design Decisions 1 and 2 — one function decides the provider every
// stage binds to on its first attempt: the Administrator's choice when it names a shipped adapter, else the
// registry's settings default. It reads SQLite on every call, so a change applies to the next bind with no restart.

export { PROVIDER_STAGES, type ProviderStage } from "./providerTypes.ts";

/** The shape every stage's adapter registry shares. `aliases` resolve but are never offered as a choice. */
export interface ProviderRegistry<Adapter> {
  defaultIdentifier: string;
  adapters: Record<string, Adapter>;
  labels?: Record<string, string>;
  aliases?: readonly string[];
  /** Profiles that still resolve, for the work bound to them, but are no longer offered (JOS-218). */
  retired?: readonly string[];
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
  const hidden = new Set([...(registry.aliases ?? []), ...(registry.retired ?? [])]);
  return Object.keys(registry.adapters)
    .filter((id) => !hidden.has(id))
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
  // record-provider-changes (JOS-229), design Decision 3 — the choice and its log entry are written together; saving the
  // provider that is already active changes nothing and logs nothing.
  inTransaction(() => {
    const previous = activeProviderId(stage);
    const changedAt = now().toISOString();
    upsertActiveProviderChoice(stage, providerId, changedAt);
    if (previous === providerId) return;
    recordProviderChange({
      changedAt,
      kind: "active-provider",
      stage,
      runId: null,
      sceneId: null,
      previousProviderId: previous,
      previousProviderLabel: labelOf(stage, previous),
      newProviderId: providerId,
      newProviderLabel: labelOf(stage, providerId),
    });
  });
}

/**
 * The adapter a stage instance is bound to. Reasoning and alignment receive their default adapter as an injected
 * instance (the decomposition dependencies), so that instance stands for the registry's default id; any other
 * bound id is looked up in the registry. `undefined` means the build does not ship the bound adapter.
 */
export function resolveBoundAdapter<Adapter>(registry: ProviderRegistry<Adapter>, boundId: string, injectedDefault: Adapter): Adapter | undefined {
  return boundId === registry.defaultIdentifier ? injectedDefault : registry.adapters[boundId];
}

export interface ProviderView {
  stage: ProviderStage;
  activeProviderId: string;
  activeLabel: string;
  source: "settings" | "admin";
  selectable: Array<{ id: string; label: string }>;
  orphanedChoice: string | null;
}

/** What `/admin` shows for one stage (design Decision 5). */
export function providerView(stage: ProviderStage): ProviderView {
  const registry = registryFor(stage);
  const active = activeProviderId(stage);
  const choice = getActiveProviderChoice(stage);
  return {
    stage,
    activeProviderId: active,
    activeLabel: registry.labels?.[active] ?? active,
    source: choice !== null && choice === active ? "admin" : "settings",
    selectable: selectableProviders(stage),
    orphanedChoice: orphanedChoice(stage),
  };
}

/** The display name of a provider of a stage: its label, or its id when the registry has none. */
export function labelOf(stage: ProviderStage, providerId: string): string {
  return registryFor(stage).labels?.[providerId] ?? providerId;
}
