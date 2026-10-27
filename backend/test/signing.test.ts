import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// sign-executables (JOS-207), tasks 2.1 to 2.5 — the signing decisions run offline, without certificates.
const ROOT = join(import.meta.dirname, "..", "..");
const SIGNING = join(ROOT, ".github", "scripts", "signing.sh");
const SIGN_MACOS = join(ROOT, ".github", "scripts", "sign-macos.sh");
const WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf8");

const run = (script: string, args: string[], env: Record<string, string> = {}, path?: string) =>
  spawnSync("bash", [script, ...args], { encoding: "utf8", env: { ...process.env, ...env, ...(path ? { PATH: path } : {}) } });

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vid4you-signing-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("signing.sh decide", () => {
  it("signs when every secret is set", () => {
    const result = run(SIGNING, ["decide", "true", "A", "B"], { A: "a", B: "b" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("sign");
  });

  it("fails naming the missing secret when signing is required", () => {
    const result = run(SIGNING, ["decide", "true", "A", "B"], { A: "a", B: "" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("B");
    expect(result.stderr).not.toContain("A is missing");
  });

  it("skips and marks the files unsigned when signing is not required", () => {
    for (const required of ["", "false"]) {
      const result = run(SIGNING, ["decide", required, "A"], { A: "" });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("unsigned");
    }
  });
});

describe("signing.sh notes", () => {
  it("carries the not-signed line only when an archive is unsigned", () => {
    writeFileSync(join(dir, "Vid4You-darwin-arm64.zip"), "x");
    expect(run(SIGNING, ["notes", dir]).stdout).not.toContain("not signed");
    writeFileSync(join(dir, "Vid4You-win32-x64-unsigned.zip"), "x");
    expect(run(SIGNING, ["notes", dir]).stdout).toContain("not signed");
  });
});

describe("release.yml signing order", () => {
  const index = (needle: string): number => {
    const at = WORKFLOW.indexOf(needle);
    expect(at, `release.yml has no "${needle}"`).toBeGreaterThan(-1);
    return at;
  };

  it("signs and verifies before it zips, and hashes only after the zips are downloaded in publish", () => {
    expect(index("sign-macos.sh sign")).toBeLessThan(index("- name: Zip"));
    expect(index("sign-macos.sh notarize")).toBeLessThan(index("- name: Zip"));
    expect(index("verify-windows.ps1")).toBeLessThan(index("- name: Zip"));
    expect(index("- name: Zip")).toBeLessThan(index("release.sh checksums"));
  });

  it("deletes the temporary keychain in a step that always runs", () => {
    expect(WORKFLOW).toMatch(/if: always\(\)[^\n]*\n(?:[^\n]*\n){0,3}[^\n]*sign-macos\.sh cleanup/);
  });

  it("attaches the signing environment only for a push to main", () => {
    expect(WORKFLOW).toContain("environment: ${{ github.ref == 'refs/heads/main' && github.event_name == 'push' && 'signing' || '' }}");
  });
});

describe("sign-macos.sh log masking", () => {
  const SECRETS = { MACOS_CERTIFICATE_P12: "Zm9vYmFy", MACOS_CERTIFICATE_PASSWORD: "hunter2-password", APPLE_API_KEY_ID: "KEYID12345", APPLE_API_ISSUER_ID: "issuer-0000-1111", APPLE_API_KEY_P8: "-----BEGIN PRIVATE KEY-----p8body" };

  // Stubs for the macOS tools; each records its arguments so the test can see what was called.
  const stubPath = (): string => {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const calls = join(dir, "calls.log");
    const stub = (name: string, body = "") => {
      writeFileSync(join(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${calls}"\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    };
    stub("security", 'case "$1" in find-identity) echo \'  1) ABCDEF "Developer ID Application: Test (TEAM)"\';; esac');
    stub("codesign");
    stub("ditto");
    stub("xcrun", 'case "$2" in submit) echo "  id: sub-123"; echo "  status: Accepted";; esac');
    return `${bin}${delimiter}${process.env.PATH}`;
  };

  it("never prints a secret value while signing, notarizing and cleaning up", () => {
    const path = stubPath();
    mkdirSync(join(dir, "app"));
    const env = { ...SECRETS, RUNNER_TEMP: dir };
    const output = ["sign", "notarize", "cleanup"].map((step) => {
      const result = run(SIGN_MACOS, [step, join(dir, "app")], env, path);
      expect(result.status, result.stderr).toBe(0);
      return result.stdout + result.stderr;
    }).join("");
    const calls = readFileSync(join(dir, "calls.log"), "utf8");
    // The tools take the certificate password and key id as arguments (no stdin or env alternative), so only the output is checked.
    for (const value of Object.values(SECRETS)) expect(output).not.toContain(value);
    expect(calls).toContain("--options runtime");
    expect(calls).toContain("delete-keychain");
  });

  it("fails and shows the notarization log when Apple does not accept the submission", () => {
    const path = stubPath();
    writeFileSync(join(dir, "bin", "xcrun"), '#!/usr/bin/env bash\ncase "$2" in submit) echo "  id: sub-9"; echo "  status: Invalid";; log) echo "the log";; esac\n');
    mkdirSync(join(dir, "app"));
    const result = run(SIGN_MACOS, ["notarize", join(dir, "app")], { ...SECRETS, RUNNER_TEMP: dir }, path);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("the log");
  });
});
