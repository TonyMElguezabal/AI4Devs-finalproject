import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeProviderId, PROVIDER_STAGES, setActiveProvider, type ProviderStage } from "../src/activeProvider.ts";
import { resetAll } from "../src/db.ts";
import { resetAlignmentProviderRegistry, resetReasoningProviderRegistry, setAlignmentProviderRegistry, setReasoningProviderRegistry } from "../src/decompositionDependencies.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// change-active-provider-from-admin (JOS-171), group 3 — design Decisions 1 and 2: the active provider of a
// stage is the /admin choice when it names a shipped adapter, else the registry's settings default.

// Two stub adapters per stage; the adapters are never called here, only looked up by id.
const adapters = { "stub-a": {}, "stub-b": {} } as never;

function installStubRegistries(): void {
  setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setImageProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters });
}

beforeEach(() => {
  resetAll();
  installStubRegistries();
});

afterEach(() => {
  resetReasoningProviderRegistry();
  resetAlignmentProviderRegistry();
  resetVoiceProviderRegistry();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
  vi.restoreAllMocks();
});

describe.each(PROVIDER_STAGES)("activeProviderId(%s)", (stage: ProviderStage) => {
  it("is the registry's settings default when no choice was made", () => {
    expect(activeProviderId(stage)).toBe("stub-a");
  });

  it("is the chosen adapter once the Administrator chose one", () => {
    setActiveProvider(stage, "stub-b");
    expect(activeProviderId(stage)).toBe("stub-b");
  });

  it("sees a write at once, with no restart", () => {
    setActiveProvider(stage, "stub-b");
    expect(activeProviderId(stage)).toBe("stub-b");
    setActiveProvider(stage, "stub-a");
    expect(activeProviderId(stage)).toBe("stub-a");
  });

  it("falls back to the settings default, warns once and does not throw when the choice is no longer shipped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setActiveProvider(stage, "stub-b");
    setImageProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {} } as never });
    setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {} } as never });
    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {} } as never });
    setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {} } as never });
    setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {} } as never });
    expect(activeProviderId(stage)).toBe("stub-a");
    expect(activeProviderId(stage)).toBe("stub-a");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("setActiveProvider", () => {
  it("refuses a provider the stage does not ship and leaves the choice unchanged", () => {
    setActiveProvider("video", "stub-b");
    expect(() => setActiveProvider("video", "acme")).toThrow(/acme/);
    expect(activeProviderId("video")).toBe("stub-b");
  });

  it("refuses an alias: it resolves but is never a choice", () => {
    setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {}, legacy: {} } as never, aliases: ["legacy"] });
    expect(() => setActiveProvider("video", "legacy")).toThrow(/legacy/);
  });

  it("keeps the stages independent", () => {
    setActiveProvider("image", "stub-b");
    expect(activeProviderId("video")).toBe("stub-a");
  });
});
