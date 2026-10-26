import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BILLED_UNITS, ADAPTER_TYPES, validateProviderParameters } from "../src/providerTypes.ts";

// add-provider-price-per-unit (JOS-226), groups 2.1 and 2.3 — design Decisions 1, 2 and 3.

const base: Record<string, Record<string, unknown>> = {
  "openai-reasoning": { model: "gpt-5" },
  "elevenlabs-voice": { model: "eleven_v3", voiceId: "v", voiceName: "V", outputFormat: "mp3_44100_128", speed: "default" },
  "elevenlabs-alignment": { endpoint: "/v1/forced-alignment" },
  "fal-image": { model: "fal-ai/flux/dev" },
  "runninghub-video": { endpoint: "/task/openapi/ai-app/run", admittedDurationSeconds: { min: 3, max: 8 } },
};

describe.each(Object.keys(base))("price parameters of %s", (type) => {
  const check = (extra: Record<string, unknown>) => validateProviderParameters(type, { ...base[type], ...extra });
  const problemFields = (extra: Record<string, unknown>) => {
    const result = check(extra);
    return result.ok ? [] : result.problems.map((problem) => problem.field).sort();
  };

  it("accepts no price", () => {
    expect(check({})).toEqual({ ok: true, parameters: base[type] });
  });

  it("accepts a price with a currency and stores the currency upper-case", () => {
    expect(check({ pricePerUnit: 0.00003, priceCurrency: "usd" })).toEqual({ ok: true, parameters: { ...base[type], pricePerUnit: 0.00003, priceCurrency: "USD" } });
  });

  it("accepts zero as a price", () => {
    expect(check({ pricePerUnit: 0, priceCurrency: "EUR" }).ok).toBe(true);
  });

  it("refuses a negative price, a non-number, an unknown or malformed currency, and one without the other", () => {
    expect(problemFields({ pricePerUnit: -1, priceCurrency: "USD" })).toEqual(["pricePerUnit"]);
    expect(problemFields({ pricePerUnit: "1", priceCurrency: "USD" })).toEqual(["pricePerUnit"]);
    expect(problemFields({ pricePerUnit: 1, priceCurrency: "ZZZ" })).toEqual(["priceCurrency"]);
    expect(problemFields({ pricePerUnit: 1, priceCurrency: "US" })).toEqual(["priceCurrency"]);
    expect(problemFields({ pricePerUnit: 1 })).toEqual(["priceCurrency"]);
    expect(problemFields({ priceCurrency: "USD" })).toEqual(["pricePerUnit"]);
  });

  it("lists a price problem together with other parameter problems and never a value", () => {
    const result = validateProviderParameters(type, { ...base[type], ...(type === "elevenlabs-alignment" ? { endpoint: "" } : { [type === "runninghub-video" ? "endpoint" : "model"]: "" }), pricePerUnit: -12345, priceCurrency: "USD" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.length).toBe(2);
    expect(JSON.stringify(result.problems)).not.toContain("12345");
  });
});

describe("billed units and price fields", () => {
  it("names the unit of each stage", () => {
    expect(BILLED_UNITS).toEqual({
      voice: { id: "voice_characters", label: "voice character" },
      alignment: { id: "audio_seconds", label: "audio second" },
      reasoning: { id: "requests", label: "request" },
      image: { id: "images", label: "image" },
      video: { id: "clip_seconds", label: "clip second" },
    });
  });

  it.each(ADAPTER_TYPES)("$id ends with the optional price and currency fields", (type) => {
    const [price, currency] = type.fields.slice(-2);
    expect(price).toMatchObject({ path: ["pricePerUnit"], label: `Price per ${BILLED_UNITS[type.stage].label}`, kind: "number", required: false });
    expect(currency).toMatchObject({ path: ["priceCurrency"], label: "Currency", kind: "text", required: false });
  });
});

// Groups 2.5 and 2.6 — design Decision 2: the settings files take no price, and a price is not settings drift.
describe("the settings files and the drift notice", () => {
  it("rejects a price in a provider section of the settings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-price-"));
    const saved = process.env.SETTINGS_PATH;
    try {
      writeFileSync(join(dir, "settings.json"), JSON.stringify({ voice: { pricePerUnit: 1 } }));
      process.env.SETTINGS_PATH = join(dir, "settings.json");
      vi.resetModules();
      await expect(import("../src/config/providers.ts")).rejects.toThrow(/pricePerUnit/);
    } finally {
      if (saved === undefined) delete process.env.SETTINGS_PATH;
      else process.env.SETTINGS_PATH = saved;
      vi.resetModules();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("raises no notice for a priced first profile, and still raises one for a different model", async () => {
    const { SETTINGS } = await import("../src/config/providers.ts");
    const { resetAll } = await import("../src/db.ts");
    const { getProfile, seedProviderProfiles, updateProfile } = await import("../src/providerProfiles.ts");
    resetAll();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    seedProviderProfiles(SETTINGS);
    const image = getProfile("Fal.ai")!;
    updateProfile("Fal.ai", { label: image.label, parameters: { ...image.parameters, pricePerUnit: 0.04, priceCurrency: "USD" } }, "2026-10-23T00:00:00.000Z");

    seedProviderProfiles(SETTINGS);
    expect(warn).not.toHaveBeenCalled();

    seedProviderProfiles({ ...SETTINGS, image: { ...SETTINGS.image, model: "another/model" } });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
