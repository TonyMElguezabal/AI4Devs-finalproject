import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSecretsPath } from "../src/config/credentials.ts";
import { resolveSettingsDefaultsPath } from "../src/config/providers.ts";

// package-executables-build (JOS-205), task 1.5 — the packaged app moves two file locations by environment variable.
describe("resolveSecretsPath", () => {
  it("reads SECRETS_PATH when set", () => {
    expect(resolveSecretsPath({ SECRETS_PATH: "/data/.secrets.json" })).toBe("/data/.secrets.json");
  });
  it("keeps the old path otherwise", () => {
    expect(resolveSecretsPath({})).toBe(resolve(import.meta.dirname, "../.secrets.json"));
  });
});

describe("resolveSettingsDefaultsPath", () => {
  it("reads SETTINGS_DEFAULTS_PATH when set", () => {
    expect(resolveSettingsDefaultsPath({ SETTINGS_DEFAULTS_PATH: "/data/runtime/settings.default.json" })).toBe("/data/runtime/settings.default.json");
  });
  it("keeps the old path otherwise", () => {
    expect(resolveSettingsDefaultsPath({})).toBe(resolve(import.meta.dirname, "../config/settings.default.json"));
  });
});
