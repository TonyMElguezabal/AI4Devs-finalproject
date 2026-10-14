// JOS-194 proof of concept (Decision 14) — builds the packaged executable for the CURRENT platform into poc/local/out/.
// Usage (repository root): node openspec/changes/define-production-deployment/poc/local/build.mjs
// Needs: frontend/node_modules (for vite and esbuild) and backend/node_modules.
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../../../..");
const out = join(here, "out");
const exe = process.platform === "win32" ? ".exe" : "";
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. Frontend, with a same-origin API base (Story L2/frontend API base): the executable serves page and API on one port.
run(join(repo, "frontend/node_modules/.bin/vite"), ["build", "--outDir", join(out, "web"), "--emptyOutDir"], {
  cwd: join(repo, "frontend"),
  env: { ...process.env, VITE_API_BASE: "" },
});

// 2. Backend + entry, one CommonJS file. Two PoC substitutions, each a follow-up story.
const { build } = await import(join(repo, "frontend/node_modules/esbuild/lib/main.js"));
await build({
  entryPoints: [join(here, "entry.ts")],
  outfile: join(out, "vid4you.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  nodePaths: [join(repo, "backend/node_modules")],
  define: {
    // credentials.ts resolves "../../.secrets.json" from import.meta.dirname (Story L2); env.ts sets this global first.
    "import.meta.dirname": "globalThis.__VID4YOU_CREDENTIALS_BASE",
    // server.ts only uses import.meta.url for its entry check and the unused "/" page (the executable serves "/").
    "import.meta.url": '"file:///vid4you-bundle/backend/src/server.ts"',
  },
  plugins: [{
    name: "poc-substitutions",
    setup(b) {
      // Story L1: drop server.ts's own bootstrap (top-level await, entry check that fails in a bundle and on Windows).
      b.onLoad({ filter: /backend[\\/]src[\\/]server\.ts$/ }, (args) => {
        const source = readFileSync(args.path, "utf8");
        const cut = source.indexOf("// Bootstrap only when this file is run directly");
        if (cut < 0) throw new Error("server.ts bootstrap marker not found");
        return { contents: source.slice(0, cut), loader: "ts" };
      });
      // Story L5: no interactive API docs in a packaged build (swagger-ui serves files from node_modules at runtime).
      b.onResolve({ filter: /^@fastify\/swagger-ui$/ }, () => ({ path: "no-docs", namespace: "poc" }));
      b.onLoad({ filter: /^no-docs$/, namespace: "poc" }, () => ({ contents: "export default async function noDocs() {}", loader: "js" }));
    },
  }],
  logLevel: "warning",
});

// 3. ffmpeg / ffprobe beside the executable (Story S2). PoC source: the static builds published on npm.
const tools = join(out, ".tools");
mkdirSync(tools, { recursive: true });
writeFileSync(join(tools, "package.json"), JSON.stringify({ private: true }));
run("npm", ["install", "--no-audit", "--no-fund", "--silent", "ffmpeg-static@5.2.0", "ffprobe-static@3.1.0"], { cwd: tools });
const ffprobeArch = { darwin: `darwin/${process.arch}`, win32: `win32/${process.arch}`, linux: `linux/${process.arch}` }[process.platform];
copyFileSync(join(tools, `node_modules/ffmpeg-static/ffmpeg${exe}`), join(out, `ffmpeg${exe}`));
copyFileSync(join(tools, `node_modules/ffprobe-static/bin/${ffprobeArch}/ffprobe${exe}`), join(out, `ffprobe${exe}`));
chmodSync(join(out, `ffmpeg${exe}`), 0o755);
chmodSync(join(out, `ffprobe${exe}`), 0o755);

// 4. Single executable application with the web build embedded as assets.
const walk = (dir) => readdirSync(dir).flatMap((name) => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]);
const assets = Object.fromEntries(walk(join(out, "web")).map((file) => [`web/${relative(join(out, "web"), file).split("\\").join("/")}`, file]));
const seaConfig = join(out, "sea-config.json");
writeFileSync(seaConfig, JSON.stringify({
  main: join(out, "vid4you.cjs"),
  output: join(out, `Vid4You${exe}`),
  disableExperimentalSEAWarning: true,
  assets,
}, null, 2));
// Homebrew's node is built without the SEA fuse; use the official release binary of the same version (checksum-verified).
const nodeVersion = process.version; // e.g. v26.4.0
const nodePlatform = { darwin: "darwin", linux: "linux", win32: "win" }[process.platform];
const nodeDist = `node-${nodeVersion}-${nodePlatform}-${process.arch}`;
const archiveName = process.platform === "win32" ? `${nodeDist}.zip` : `${nodeDist}.tar.gz`;
const baseUrl = `https://nodejs.org/dist/${nodeVersion}`;
run("curl", ["-fsSL", "-o", join(tools, archiveName), `${baseUrl}/${archiveName}`]);
run("curl", ["-fsSL", "-o", join(tools, "SHASUMS256.txt"), `${baseUrl}/SHASUMS256.txt`]);
const expected = readFileSync(join(tools, "SHASUMS256.txt"), "utf8").split("\n").find((line) => line.endsWith(`  ${archiveName}`))?.split(" ")[0];
const { createHash } = await import("node:crypto");
const actual = createHash("sha256").update(readFileSync(join(tools, archiveName))).digest("hex");
if (!expected || expected !== actual) throw new Error(`checksum mismatch for ${archiveName}`);
if (process.platform === "win32") run("tar", ["-xf", join(tools, archiveName), "-C", tools]);
else run("tar", ["-xzf", join(tools, archiveName), "-C", tools]);
const officialNode = process.platform === "win32" ? join(tools, nodeDist, "node.exe") : join(tools, nodeDist, "bin", "node");
run(officialNode, ["--build-sea", seaConfig]);
if (process.platform === "darwin") run("codesign", ["--sign", "-", "--force", join(out, "Vid4You")]);

rmSync(tools, { recursive: true, force: true });
console.log(`\nBuilt ${join(out, `Vid4You${exe}`)} (${(statSync(join(out, `Vid4You${exe}`)).size / 1e6).toFixed(1)} MB) with ${Object.keys(assets).length} embedded web files`);
if (!existsSync(join(out, `ffmpeg${exe}`))) throw new Error("ffmpeg missing");
