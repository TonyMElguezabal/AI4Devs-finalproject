import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import sea from "node:sea";
import { isAlreadyRunning, openBrowser } from "./instance.ts";
import { buildRuntimeEnvironment, resolveDataDir, sanitizeEnvironment } from "./runtimeEnv.ts";

// package-executables-build (JOS-205) Decisions 4-7 — the packaged application's entry point. It sets the environment the
// backend reads, then starts the same boot sequence `npm start` runs; the backend is imported only after the environment
// is final, because its modules read their locations when they load.

/** Replaced by esbuild at build time (`true` only in the `--smoke` flavor), so the release bundle has no smoke code. */
declare const __VID4YOU_SMOKE__: boolean;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2",
};

function readAsset(name: string): Buffer | undefined {
  try {
    return Buffer.from(sea.getAsset(name));
  } catch {
    return undefined; // the SEA API throws for an unknown asset
  }
}

async function main(): Promise<void> {
  if (!__VID4YOU_SMOKE__) sanitizeEnvironment(process.env);
  const dataDir = resolveDataDir({ platform: process.platform, env: process.env });
  const runtime = buildRuntimeEnvironment({ dataDir, binDir: dirname(process.execPath), platform: process.platform });
  Object.assign(process.env, runtime);
  process.env.PORT = process.env.VID4YOU_PORT ?? process.env.PORT ?? "3100";
  const port = Number(process.env.PORT);
  const appUrl = `http://127.0.0.1:${port}/`;

  if (await isAlreadyRunning(port)) {
    console.log(`Vid4You is already running at ${appUrl}; opening it.`);
    openBrowser(appUrl);
    return;
  }

  // The defaults are rewritten on every start, so they always match this binary.
  const defaults = readAsset("settings.default.json");
  if (!defaults) throw new Error("the settings defaults are missing from the executable");
  mkdirSync(dirname(runtime.SETTINGS_DEFAULTS_PATH), { recursive: true });
  writeFileSync(runtime.SETTINGS_DEFAULTS_PATH, defaults);

  if (__VID4YOU_SMOKE__) {
    const { installSmokeStubs } = await import("./smokeStubs.ts");
    installSmokeStubs({ ffmpegPath: runtime.FFMPEG_PATH, dataDir });
  }

  const { startServer } = await import("../src/bootstrap.ts");
  await startServer({
    staticAssets: (path) => {
      const file = path === "/" ? "index.html" : path.slice(1);
      const body = readAsset(`web/${file}`);
      return body ? { body, contentType: CONTENT_TYPES[extname(file)] ?? "application/octet-stream" } : undefined;
    },
  });
  console.log(`Vid4You is running at ${appUrl} (data: ${dataDir})`);
  openBrowser(appUrl);
}

main().catch((error: unknown) => {
  console.error("Vid4You failed to start:", error);
  process.exit(1);
});
