import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectableProviders } from "../src/activeProvider.ts";
import { resetAll } from "../src/db.ts";
import { resetAlignmentProviderRegistry, resetReasoningProviderRegistry, getAlignmentProviderRegistry, getReasoningProviderRegistry, setDecompositionDependencies, resetDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { getImageProviderRegistry, resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { resetKeyStoreCache, storeProfileKey } from "../src/keyStore.ts";
import { insertProfile, removeProfile, retireProfile, seedProviderProfiles, updateProfile } from "../src/providerProfiles.ts";
import { SETTINGS } from "../src/config/providers.ts";
import { getVideoProviderRegistry, resetVideoProviderRegistry } from "../src/videoProvider.ts";
import { getVoiceProviderRegistry, resetVoiceProviderRegistry } from "../src/voiceProvider.ts";
import { LEGACY_IMAGE_PROVIDER_IDENTIFIER, LEGACY_VIDEO_PROVIDER_IDENTIFIER } from "../src/config/providers.ts";
import { imageProviderFromGenerate } from "./imageProviderFixtures.ts";

// manage-providers-from-admin (JOS-218), group 4 — design Decision 3: the registries are built from the provider
// profiles; a change to a profile reaches the next resolution without a restart.

const NOW = "2099-01-01T00:00:00.000Z"; // after the seeded profiles, so the listing order is the creation order
let fetchedUrls: string[];
let keyFolder: string;

beforeEach(() => {
  resetVoiceProviderRegistry(); // test/setup.ts installs a stub for every test
  resetAll();
  seedProviderProfiles(SETTINGS);
  fetchedUrls = [];
  keyFolder = mkdtempSync(join(tmpdir(), "vid4you-registry-keys-"));
  process.env.PROVIDER_KEY_PATH = join(keyFolder, "provider-keys.key");
  resetKeyStoreCache();
  vi.stubGlobal("fetch", async (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    return new Response("{}", { status: 500 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(keyFolder, { recursive: true, force: true });
  delete process.env.PROVIDER_KEY_PATH;
  resetKeyStoreCache();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
  resetVoiceProviderRegistry();
  resetReasoningProviderRegistry();
  resetAlignmentProviderRegistry();
  resetDecompositionDependencies();
});

const addImageProfile = (id: string, model: string) => insertProfile({ id, stage: "image", adapterType: "fal-image", label: `Label ${id}`, parameters: { model } }, NOW);

describe("the registries built from the profiles", () => {
  it("holds one adapter per profile, the seeded profile as the default, and the legacy keys as aliases", () => {
    const image = getImageProviderRegistry();
    expect(image.defaultIdentifier).toBe("Fal.ai");
    expect(Object.keys(image.adapters).sort()).toEqual([LEGACY_IMAGE_PROVIDER_IDENTIFIER, "Fal.ai"].sort());
    expect(image.aliases).toEqual([LEGACY_IMAGE_PROVIDER_IDENTIFIER]);
    expect(image.adapters[LEGACY_IMAGE_PROVIDER_IDENTIFIER]).toBe(image.adapters["Fal.ai"]);
    const video = getVideoProviderRegistry();
    expect(video.defaultIdentifier).toBe("RunningHub");
    expect(video.aliases).toEqual([LEGACY_VIDEO_PROVIDER_IDENTIFIER]);
    expect(getVoiceProviderRegistry().defaultIdentifier).toBe("ElevenLabs");
    expect(getReasoningProviderRegistry().defaultIdentifier).toBe("openai-decomposition");
    expect(getAlignmentProviderRegistry().defaultIdentifier).toBe("elevenlabs-forced-alignment");
  });

  it("offers a profile added later with its label, without a restart", () => {
    expect(selectableProviders("image").map((provider) => provider.id)).toEqual(["Fal.ai"]);
    addImageProfile("01ADDED", "fal-ai/flux-pro");
    expect(selectableProviders("image")).toEqual([
      { id: "Fal.ai", label: "Fal.ai" },
      { id: "01ADDED", label: "Label 01ADDED" },
    ]);
  });

  it("sends an added profile's requests to its own model with its own key", async () => {
    addImageProfile("01ADDED", "fal-ai/flux-pro");
    storeProfileKey("01ADDED", "added-profile-key-1");
    await getImageProviderRegistry().adapters["01ADDED"]!.submit("a lighthouse");
    expect(fetchedUrls).toEqual(["https://queue.fal.run/fal-ai/flux-pro"]);
  });

  it("uses an edited parameter on the next resolution, while a call already holding the old adapter is unaffected", async () => {
    addImageProfile("01ADDED", "model-before");
    storeProfileKey("01ADDED", "added-profile-key-1");
    const before = getImageProviderRegistry().adapters["01ADDED"]!;
    updateProfile("01ADDED", { label: "Renamed", parameters: { model: "model-after" } }, NOW);

    await getImageProviderRegistry().adapters["01ADDED"]!.submit("a");
    await before.submit("b");

    expect(fetchedUrls).toEqual(["https://queue.fal.run/model-after", "https://queue.fal.run/model-before"]);
    expect(selectableProviders("image").find((provider) => provider.id === "01ADDED")!.label).toBe("Renamed");
  });

  it("keeps a retired profile resolvable but does not offer it", () => {
    addImageProfile("01ADDED", "m");
    retireProfile("01ADDED", NOW);
    expect(getImageProviderRegistry().adapters["01ADDED"]).toBeDefined();
    expect(selectableProviders("image").map((provider) => provider.id)).toEqual(["Fal.ai"]);
  });

  it("drops a removed profile", () => {
    addImageProfile("01ADDED", "m");
    removeProfile("01ADDED");
    expect(getImageProviderRegistry().adapters["01ADDED"]).toBeUndefined();
  });

  it("lets a test replace a registry, and puts the profiles back on reset", () => {
    setImageProviderRegistry({ defaultIdentifier: "stub", adapters: { stub: imageProviderFromGenerate(async () => ({ kind: "failed_transient", reason: "x" })) } });
    expect(getImageProviderRegistry().defaultIdentifier).toBe("stub");
    resetImageProviderRegistry();
    expect(getImageProviderRegistry().defaultIdentifier).toBe("Fal.ai");
  });
});

describe("an upgraded store", () => {
  it("resolves the stored bindings through the profiles the first start creates (no profile existed before)", () => {
    resetAll(); // a database from before this change: sessions and scenes exist, the provider_profiles table is empty
    expect(Object.keys(getImageProviderRegistry().adapters)).toContain("Fal.ai");
    expect(Object.keys(getImageProviderRegistry().adapters)).toContain(LEGACY_IMAGE_PROVIDER_IDENTIFIER);
    expect(Object.keys(getVideoProviderRegistry().adapters)).toContain("RunningHub");
    expect(Object.keys(getVoiceProviderRegistry().adapters)).toContain("ElevenLabs");
    expect(Object.keys(getReasoningProviderRegistry().adapters)).toContain("openai-decomposition");
    expect(Object.keys(getAlignmentProviderRegistry().adapters)).toContain("elevenlabs-forced-alignment");
  });
});

describe("the reasoning and alignment registries", () => {
  it("use the injected dependencies as the seeded profile's adapter and build the other profiles", () => {
    const injected = { generate: async () => ({ kind: "failed_transient" as const, reason: "x" }) };
    setDecompositionDependencies({ alignmentProvider: { align: async () => ({ kind: "failed_transient" as const, reason: "x" }) }, instructionGenerator: injected });
    insertProfile({ id: "01REASON", stage: "reasoning", adapterType: "openai-reasoning", label: "Other model", parameters: { model: "gpt-other" } }, NOW);
    const registry = getReasoningProviderRegistry();
    expect(registry.adapters["openai-decomposition"]).toBe(injected);
    expect(registry.adapters["01REASON"]).toBeDefined();
    expect(selectableProviders("reasoning").map((provider) => provider.id)).toEqual(["openai-decomposition", "01REASON"]);
  });
});
