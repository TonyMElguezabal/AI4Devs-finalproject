import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCredential } from "../src/config/credentials.ts";

// define-provider-configuration (JOS-165) task 2.1 — credentials load from
// the local environment or a local secrets file, never from source. This
// is the first change in the project to call a real provider, so this path
// is verified before any key is used, per design.md Decision (credential
// path) and PRD §2.1/§11.

const ENV_NAME = "TEST_CREDENTIAL_ENV_ONLY";
const SECRETS_ONLY_NAME = "TEST_CREDENTIAL_SECRETS_ONLY";
const MISSING_NAME = "TEST_CREDENTIAL_MISSING_ENTIRELY";

let secretsDir: string;
let secretsPath: string;

beforeEach(() => {
  secretsDir = mkdtempSync(join(tmpdir(), "vid4you-secrets-test-"));
  secretsPath = join(secretsDir, ".secrets.json");
  delete process.env[ENV_NAME];
  delete process.env[SECRETS_ONLY_NAME];
  delete process.env[MISSING_NAME];
});

afterEach(() => {
  rmSync(secretsDir, { recursive: true, force: true });
  delete process.env[ENV_NAME];
  delete process.env[SECRETS_ONLY_NAME];
});

describe("loadCredential reads from the local environment first (2.1)", () => {
  it("returns the environment variable's value when it is set", () => {
    process.env[ENV_NAME] = "env-value";
    expect(loadCredential(ENV_NAME, { secretsPath })).toBe("env-value");
  });
});

describe("loadCredential falls back to a local secrets file (2.1)", () => {
  it("returns the value from the secrets file when the env var is absent", () => {
    writeFileSync(secretsPath, JSON.stringify({ [SECRETS_ONLY_NAME]: "secrets-file-value" }));
    expect(loadCredential(SECRETS_ONLY_NAME, { secretsPath })).toBe("secrets-file-value");
  });

  it("prefers the environment variable over the secrets file when both are present", () => {
    process.env[ENV_NAME] = "env-wins";
    writeFileSync(secretsPath, JSON.stringify({ [ENV_NAME]: "secrets-file-loses" }));
    expect(loadCredential(ENV_NAME, { secretsPath })).toBe("env-wins");
  });
});

describe("loadCredential fails clearly when neither source has the credential (5.10 precursor)", () => {
  it("throws naming the credential, with no secret value in the message", () => {
    expect(() => loadCredential(MISSING_NAME, { secretsPath })).toThrowError(/TEST_CREDENTIAL_MISSING_ENTIRELY/);
  });

  it("never includes a credential value from the secrets file in a thrown message", () => {
    writeFileSync(secretsPath, JSON.stringify({ [ENV_NAME]: "should-never-appear-in-an-error" }));
    let thrown: unknown;
    try {
      loadCredential(MISSING_NAME, { secretsPath });
    } catch (err) {
      thrown = err;
    }
    expect(String(thrown)).not.toContain("should-never-appear-in-an-error");
  });
});

describe("the secrets file itself", () => {
  it("does not need to exist for env-only lookups to work", () => {
    expect(existsSync(secretsPath)).toBe(false);
    process.env[ENV_NAME] = "still-works";
    expect(loadCredential(ENV_NAME, { secretsPath })).toBe("still-works");
  });
});
