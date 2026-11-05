import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertHostCanBuild, buildTarget, bundleBackend, embeddedAssets, npmInvocation } from "../packaging/build.ts";
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

  // enable-release-workflow (JOS-206), task 1.4 — the release workflow passes the build identity through the environment.
  it("embeds the channel, version and release tag when the build variables are set", async () => {
    const outfile = join(dir, "vid4you-identity.cjs");
    await bundleBackend({ outfile, smoke: false, env: { VID4YOU_CHANNEL: "production", VID4YOU_VERSION: "2026.10.26-0123456", VID4YOU_RELEASE_TAG: "release-0123456abc" } });
    const bundle = readFileSync(outfile, "utf8");
    expect(bundle).toContain('"production"');
    expect(bundle).toContain("2026.10.26-0123456");
    expect(bundle).toContain("release-0123456abc");
  });

  it("leaves the identity to the environment (development) when the build variables are not set", async () => {
    const outfile = join(dir, "vid4you-dev.cjs");
    await bundleBackend({ outfile, smoke: false, env: {} });
    const bundle = readFileSync(outfile, "utf8");
    expect(bundle).not.toContain("2026.10.26-0123456");
    expect(bundle).toContain("process.env.VID4YOU_CHANNEL");
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

// fix-windows-packaging-build (JOS-232), design Decisions 1-3 — how the build starts npm; `npm` is `npm.cmd` on Windows and Node
// does not start a `.cmd` file without a shell, so the build runs npm's own script with the current Node.
describe("npmInvocation", () => {
  const WIN_NPM = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  const MAC_NPM = "/usr/local/lib/node_modules/npm/bin/npm-cli.js";

  it.each([
    ["win32", WIN_NPM],
    ["darwin", MAC_NPM],
    ["linux", MAC_NPM],
  ] as const)("runs npm's own script with the current Node, with no shell, on %s when npm started the build", (platform, npmCli) => {
    expect(npmInvocation({ npm_execpath: npmCli }, platform)).toEqual({ command: process.execPath, prefixArgs: [npmCli], shell: false });
  });

  it("falls back to `npm` with no shell on macOS and Linux when npm did not start the build", () => {
    expect(npmInvocation({}, "darwin")).toEqual({ command: "npm", prefixArgs: [], shell: false });
    expect(npmInvocation({}, "linux")).toEqual({ command: "npm", prefixArgs: [], shell: false });
  });

  it("falls back to `npm` through a shell on Windows when npm did not start the build", () => {
    expect(npmInvocation({}, "win32")).toEqual({ command: "npm", prefixArgs: [], shell: true });
  });

  it("ignores an npm_execpath that is not a JavaScript file", () => {
    expect(npmInvocation({ npm_execpath: "/usr/local/bin/npm-wrapper" }, "darwin")).toEqual({ command: "npm", prefixArgs: [], shell: false });
    expect(npmInvocation({ npm_execpath: "" }, "win32")).toEqual({ command: "npm", prefixArgs: [], shell: true });
  });
});

// add-burned-in-subtitles (JOS-237), task 5.1 — the executable carries the subtitle font and its licence.
describe("embeddedAssets", () => {
  it("lists the web build, the settings defaults, and the subtitle font with its licence, all of which exist", () => {
    const webDir = join(dir, "web");
    mkdirSync(join(webDir, "assets"), { recursive: true });
    writeFileSync(join(webDir, "index.html"), "<html></html>");
    writeFileSync(join(webDir, "assets", "app.js"), "//");

    const assets = embeddedAssets(webDir);

    expect(Object.keys(assets).sort()).toEqual(["Montserrat-Bold.ttf", "Montserrat-OFL.txt", "settings.default.json", "web/assets/app.js", "web/index.html"]);
    for (const file of Object.values(assets)) expect(existsSync(file)).toBe(true);
  });
});
