import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import { NODE_VERSION, TARGETS, type Download, type Target, type TargetName } from "./targets.ts";
import { verifyChecksum } from "./verify.ts";

// package-executables-build (JOS-205) Decision 1 — `npm run package:<target>` (`-- --smoke` for the smoke flavor) builds the
// packaged application from the product tree into backend/dist-package/<target>[-smoke]/.

const BACKEND_DIR = join(import.meta.dirname, "..");
const REPO_DIR = join(BACKEND_DIR, "..");
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

export interface BuildOptions {
  target: Target;
  /** The final output folder; it is created only after every download has been verified. */
  outDir: string;
  smoke: boolean;
  hostPlatform?: NodeJS.Platform;
}

export interface BuildDependencies {
  download: (url: string, destination: string) => Promise<void>;
}

const run = (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean } = {}): void => {
  execFileSync(command, args, { stdio: "inherit", ...options });
};

/**
 * fix-windows-packaging-build (JOS-232) Decisions 1-2 — how to start npm. On Windows `npm` is `npm.cmd`, which Node does not start
 * without a shell, so when npm started this build (`npm run package:<target>` sets `npm_execpath`) its own script is run with the
 * current Node: no `.cmd`, no shell, no quoting of the arguments. Started directly, `npm` is used, through a shell only on Windows.
 */
export function npmInvocation(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): { command: string; prefixArgs: string[]; shell: boolean } {
  const npmCli = env.npm_execpath;
  if (npmCli?.endsWith(".js")) return { command: process.execPath, prefixArgs: [npmCli], shell: false };
  return { command: "npm", prefixArgs: [], shell: platform === "win32" };
}

/** Decision 8 — a macOS executable must be ad-hoc signed with `codesign`, which only exists on a Mac. */
export function assertHostCanBuild(targetName: TargetName, hostPlatform: NodeJS.Platform): void {
  if (targetName.startsWith("darwin") && hostPlatform !== "darwin") {
    throw new Error(`the ${targetName} build needs a macOS host to sign the executable (this host is ${hostPlatform})`);
  }
}

/** The backend, the packaged entry and (smoke only) the stubs, as one CommonJS file. No source is cut or rewritten. */
export async function bundleBackend(options: { outfile: string; smoke: boolean; env?: NodeJS.ProcessEnv }): Promise<void> {
  // enable-release-workflow (JOS-206) Decision 3 — the build identity is fixed at build time; a variable that is not set stays a runtime read.
  const env = options.env ?? process.env;
  const identity = Object.fromEntries(
    ["VID4YOU_CHANNEL", "VID4YOU_VERSION", "VID4YOU_RELEASE_TAG"].filter((name) => env[name]).map((name) => [`process.env.${name}`, JSON.stringify(env[name])]),
  );
  await build({
    entryPoints: [join(import.meta.dirname, "entry.ts")],
    outfile: options.outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    absWorkingDir: BACKEND_DIR,
    alias: { "@fastify/swagger-ui": join(import.meta.dirname, "noDocs.ts") },
    define: { __VID4YOU_SMOKE__: JSON.stringify(options.smoke), ...identity },
    // `import.meta` is empty in CommonJS; the backend modules that read it (settings defaults, secrets, the subtitle font) are short-circuited by their environment variable.
    logOverride: { "empty-import-meta": "silent" },
    logLevel: "warning",
  });
}

/**
 * Everything a build embeds in the executable, by asset name: the web build, the settings defaults, and the subtitle
 * font with its licence (add-burned-in-subtitles, JOS-237, design Decision 4). The entry point writes the last three to
 * the data folder at every start, so the font always matches the binary.
 */
export function embeddedAssets(webDir: string): Record<string, string> {
  return {
    ...Object.fromEntries(listFiles(webDir).map((file) => [`web/${relative(webDir, file).split("\\").join("/")}`, file])),
    "settings.default.json": join(BACKEND_DIR, "config", "settings.default.json"),
    "Montserrat-Bold.ttf": join(BACKEND_DIR, "assets", "fonts", "Montserrat-Bold.ttf"),
    "Montserrat-OFL.txt": join(BACKEND_DIR, "assets", "fonts", "OFL.txt"),
  };
}

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? listFiles(join(dir, name)) : [join(dir, name)]));

async function fetchToFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed (${response.status}) for ${url}`);
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

export async function buildTarget(options: BuildOptions, dependencies: BuildDependencies = { download: fetchToFile }): Promise<void> {
  const { target, outDir, smoke } = options;
  assertHostCanBuild(target.name, options.hostPlatform ?? process.platform);
  if (process.version !== NODE_VERSION) {
    throw new Error(`the build must run on Node ${NODE_VERSION} (the single-executable blob is tied to the Node version); this is ${process.version}`);
  }

  const work = mkdtempSync(join(tmpdir(), "vid4you-package-"));
  try {
    // 1. Download and verify everything before anything is written to the output folder.
    const downloads: { download: Download; file: string }[] = [
      { download: target.node, file: join(work, target.node.archiveName) },
      { download: target.ffmpeg, file: join(work, "ffmpeg.gz") },
      { download: target.ffprobe, file: join(work, "ffprobe.gz") },
    ];
    for (const { download, file } of downloads) {
      await dependencies.download(download.url, file);
      verifyChecksum(file, download.sha256);
    }

    // 2. Frontend with a same-origin API base: the executable serves page and API on one port.
    const webDir = join(work, "web");
    const npm = npmInvocation(process.env, options.hostPlatform ?? process.platform);
    run(npm.command, [...npm.prefixArgs, "run", "build", "--", "--outDir", webDir, "--emptyOutDir"], { cwd: join(REPO_DIR, "frontend"), env: { ...process.env, VITE_API_BASE: "" }, shell: npm.shell });

    // 3. Backend bundle and SEA blob (web build, settings defaults and subtitle font embedded as assets).
    const bundle = join(work, "vid4you.cjs");
    await bundleBackend({ outfile: bundle, smoke });
    const assets = embeddedAssets(webDir);
    const blob = join(work, "sea-prep.blob");
    const seaConfig = join(work, "sea-config.json");
    writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, assets }, null, 2));
    run(process.execPath, ["--experimental-sea-config", seaConfig]);

    // 4. The official Node binary of the target, with the blob injected.
    run("tar", ["-xf", join(work, target.node.archiveName), "-C", work]);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const executable = join(outDir, `Vid4You${target.exeSuffix}`);
    copyFileSync(join(work, target.node.binaryInArchive), executable);
    if (target.platform === "darwin") run("codesign", ["--remove-signature", executable]);
    const postject = join(BACKEND_DIR, "node_modules", "postject", "dist", "cli.js");
    run(process.execPath, [postject, executable, "NODE_SEA_BLOB", blob, "--sentinel-fuse", SEA_FUSE, ...(target.platform === "darwin" ? ["--macho-segment-name", "NODE_SEA"] : [])]);
    if (target.platform === "darwin") run("codesign", ["--sign", "-", "--force", executable]);
    chmodSync(executable, 0o755);

    // 5. ffmpeg and ffprobe beside the executable.
    for (const [name, gz] of [["ffmpeg", "ffmpeg.gz"], ["ffprobe", "ffprobe.gz"]] as const) {
      const file = join(outDir, `${name}${target.exeSuffix}`);
      writeFileSync(file, gunzipSync(readFileSync(join(work, gz))));
      chmodSync(file, 0o755);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`Built ${outDir}${smoke ? " (smoke flavor: stub providers, not for release)" : ""}`);
}

const entryFile = process.argv[1];
if (entryFile !== undefined && import.meta.url === pathToFileURL(entryFile).href) {
  const targetName = process.argv[2] as TargetName | undefined;
  const target = targetName && targetName in TARGETS ? TARGETS[targetName] : undefined;
  if (!target) {
    console.error(`usage: node packaging/build.ts <${Object.keys(TARGETS).join("|")}> [--smoke]`);
    process.exit(2);
  }
  const smoke = process.argv.includes("--smoke");
  buildTarget({ target, smoke, outDir: join(BACKEND_DIR, "dist-package", `${target.name}${smoke ? "-smoke" : ""}`) }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
// ponytail: the Node blob needs the pinned host version; a per-version download of the host Node would lift that if it becomes a nuisance.
