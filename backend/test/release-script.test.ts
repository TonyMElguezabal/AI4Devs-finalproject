import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// enable-release-workflow (JOS-206), tasks 1.1 to 1.3 — the release decisions run offline, without GitHub.
const SCRIPT = join(import.meta.dirname, "..", "..", ".github", "scripts", "release.sh");
const TREE = "0123456789abcdef0123456789abcdef01234567";
const OTHER_TREE = "fedcba9876543210fedcba9876543210fedcba98";

const release = (...args: string[]): string => execFileSync("bash", [SCRIPT, ...args], { encoding: "utf8" }).trim();

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vid4you-release-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("release.sh state", () => {
  it("prints build when no release exists", () => {
    expect(release("state", TREE)).toBe("build");
  });

  it("prints skip when the tree's release tag exists", () => {
    expect(release("state", TREE, "release-other", `release-${TREE}`)).toBe("skip");
  });

  it("prints build when only a different tree's tag exists", () => {
    expect(release("state", TREE, `release-${OTHER_TREE}`)).toBe("build");
  });

  it("does not treat a test pre-release of the same tree as a release", () => {
    expect(release("state", TREE, `test-${TREE}`)).toBe("build");
  });
});

describe("release.sh tag and version", () => {
  it("derives the tag from the tree hash", () => {
    expect(release("tag", TREE)).toBe(`release-${TREE}`);
    expect(release("tag", TREE, "test")).toBe(`test-${TREE}`);
  });

  it("derives the version from the date and the first 7 characters of the tree hash", () => {
    expect(release("version", TREE, "2026-10-26")).toBe("2026.10.26-0123456");
  });

  it("rejects a value that is not a full tree hash", () => {
    expect(spawnSync("bash", [SCRIPT, "tag", "abc"]).status).not.toBe(0);
  });
});

describe("release.sh checksums and verify", () => {
  const writeZips = (): string[] => {
    const names = ["Vid4You-darwin-arm64.zip", "Vid4You-darwin-x64.zip", "Vid4You-win32-x64.zip"];
    names.forEach((name) => writeFileSync(join(dir, name), `content of ${name}`));
    return names;
  };

  it("lists each zip in SHA256SUMS.txt and verifies untouched files", () => {
    const names = writeZips();
    release("checksums", dir);
    const listing = readFileSync(join(dir, "SHA256SUMS.txt"), "utf8");
    names.forEach((name) => expect(listing).toContain(name));
    expect(spawnSync("bash", [SCRIPT, "verify", dir]).status).toBe(0);
  });

  it("fails and names a tampered zip", () => {
    writeZips();
    release("checksums", dir);
    writeFileSync(join(dir, "Vid4You-win32-x64.zip"), "tampered");
    const result = spawnSync("bash", [SCRIPT, "verify", dir], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Vid4You-win32-x64.zip");
  });
});
