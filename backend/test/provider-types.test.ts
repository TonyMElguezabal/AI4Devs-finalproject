import { describe, expect, it } from "vitest";
import { SETTINGS } from "../src/config/providers.ts";
import { ADAPTER_TYPES, adapterTypesOf, validateProviderParameters } from "../src/providerTypes.ts";
import { PROVIDER_STAGES } from "../src/providerTypes.ts";

// manage-providers-from-admin (JOS-218), group 4 — design Decision 2: the shipped adapter types, the rules of their
// parameters, and the descriptions of their fields for the /admin form.

const seededParameters = {
  "openai-reasoning": (({ name: _n, ...rest }) => rest)(SETTINGS.decomposition),
  "elevenlabs-voice": (({ name: _n, ...rest }) => rest)(SETTINGS.voice),
  "elevenlabs-alignment": (({ name: _n, ...rest }) => rest)(SETTINGS.alignment),
  "fal-image": (({ name: _n, ...rest }) => rest)(SETTINGS.image),
  "runninghub-video": (({ name: _n, ...rest }) => rest)(SETTINGS.video),
} as const;

describe("the adapter-type catalogue", () => {
  it("ships at least one adapter type per stage", () => {
    for (const stage of PROVIDER_STAGES) expect(adapterTypesOf(stage).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(seededParameters))("%s accepts the parameters the shipped settings give it", (type, parameters) => {
    expect(validateProviderParameters(type, parameters)).toEqual({ ok: true, parameters });
  });

  it("describes every parameter as a form field with a label, a kind and whether it is required", () => {
    for (const type of ADAPTER_TYPES) {
      expect(type.fields.length).toBeGreaterThan(0);
      for (const field of type.fields) {
        expect(field.path.length).toBeGreaterThan(0);
        expect(field.label.length).toBeGreaterThan(0);
        expect(["text", "number", "choice"]).toContain(field.kind);
        expect(typeof field.required).toBe("boolean");
      }
    }
  });

  it("has a field for every key the schema accepts", () => {
    const paths = (type: string) => adapterTypesOf("video").concat(...PROVIDER_STAGES.map(adapterTypesOf)).find((t) => t.id === type)!.fields.map((f) => f.path.join("."));
    expect(paths("runninghub-video").sort()).toEqual(["admittedDurationSeconds.max", "admittedDurationSeconds.min", "endpoint", "priceCurrency", "pricePerUnit"]);
    expect(paths("elevenlabs-voice").sort()).toEqual(["model", "outputFormat", "priceCurrency", "pricePerUnit", "speed", "voiceId", "voiceName"]);
  });
});

describe("validateProviderParameters", () => {
  it("rejects an unknown parameter, including a host or a full URL", () => {
    const result = validateProviderParameters("fal-image", { model: "fal-ai/flux/dev", host: "evil.example" });
    expect(result).toEqual({ ok: false, problems: [{ field: "host", message: "host: unknown parameter" }] });
  });

  it("rejects a model or endpoint written as a URL, and an endpoint that is not a path", () => {
    expect(validateProviderParameters("fal-image", { model: "https://evil.example/x" }).ok).toBe(false);
    expect(validateProviderParameters("elevenlabs-alignment", { endpoint: "https://evil.example/v1" }).ok).toBe(false);
    expect(validateProviderParameters("elevenlabs-alignment", { endpoint: "v1/forced-alignment" }).ok).toBe(false);
  });

  it("lists every problem with its field and never a value", () => {
    const result = validateProviderParameters("runninghub-video", { endpoint: "", admittedDurationSeconds: { min: 9, max: 3 }, extra: "secret-value" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((problem) => problem.field).sort()).toEqual(["admittedDurationSeconds.min", "endpoint", "extra"]);
    expect(JSON.stringify(result.problems)).not.toContain("secret-value");
  });

  it("rejects a missing required parameter and a wrong type", () => {
    const result = validateProviderParameters("elevenlabs-voice", { model: "m", voiceId: "v", voiceName: "n", outputFormat: "mp3_44100_128", speed: 3 });
    expect(result).toEqual({ ok: false, problems: [{ field: "speed", message: 'speed: must be "default" or a number from 0.7 to 1.2' }] });
    expect(validateProviderParameters("fal-image", {})).toEqual({ ok: false, problems: [{ field: "model", message: "model: is required" }] });
  });

  it("rejects an adapter type it does not ship", () => {
    expect(validateProviderParameters("acme", {})).toEqual({ ok: false, problems: [{ field: "adapterType", message: "adapterType: unknown adapter type" }] });
  });
});
