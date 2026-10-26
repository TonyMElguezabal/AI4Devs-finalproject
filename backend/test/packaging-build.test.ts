import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertHostCanBuild, buildTarget, bundleBackend } from "../packaging/build.ts";
import { TARGETS } from "../packaging/targets.ts";

// package-executables-build (JOS-205), tasks 1.4 and 1.7 — everything here runs without network access.
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vid4you-bundle-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("bundleBackend", () => {
  it("builds the release bundle from the product tree with no docs UI, no smoke code and no archived code", async () => {
    const outfile = join(dir, "vid4you.cjs");
    await bundleBackend({ outfile, smoke: false });
    const bundle = readFileSync(outfile, "utf8");
    expect(bundle.length).toBeGreaterThan(100_000);
    expect(bundle).not.toContain("swagger-ui-dist");
    expect(bundle).not.toContain("smoke-stubs");
    expect(bundle).not.toMatch(/openspec[\\/]/);
  });

  it("includes the smoke stubs only in the smoke flavor", async () => {
    const outfile = join(dir, "vid4you-smoke.cjs");
    await bundleBackend({ outfile, smoke: true });
    expect(readFileSync(outfile, "utf8")).toContain("smoke-stubs");
  });
});

describe("macOS targets on another host", () => {
  it("assertHostCanBuild names the host a macOS target needs", () => {
    expect(() => assertHostCanBuild("darwin-arm64", "linux")).toThrow(/macOS host/);
    expect(() => assertHostCanBuild("darwin-x64", "win32")).toThrow(/macOS host/);
    expect(() => assertHostCanBuild("win32-x64", "linux")).not.toThrow();
    expect(() => assertHostCanBuild("darwin-arm64", "darwin")).not.toThrow();
  });

  it("buildTarget fails before any download", async () => {
    const download = vi.fn();
    await expect(buildTarget({ target: TARGETS["darwin-arm64"], outDir: dir, smoke: false, hostPlatform: "linux" }, { download }))
      .rejects.toThrow(/macOS host/);
    expect(download).not.toHaveBeenCalled();
  });
});
