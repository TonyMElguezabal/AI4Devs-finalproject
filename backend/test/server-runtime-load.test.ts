import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The server runs as `node src/server.ts`, which strips types without
// compiling them. Node refuses TypeScript syntax that emits code (parameter
// properties, enums, namespaces). Vitest and `tsc` both accept such code, so
// only a real `node` process can prove the server still loads — found when a
// constructor parameter property in db.ts passed every test and would have
// crashed `npm start`. `erasableSyntaxOnly` catches it at typecheck; this
// test catches whatever the flag cannot, on the real runtime.

const BACKEND_DIR = resolve(import.meta.dirname, "..");

describe("The server module loads under node's strip-only TypeScript mode", () => {
  it("imports src/server.ts and builds the app in a real node process", () => {
    const scratch = mkdtempSync(join(tmpdir(), "vid4you-runtime-load-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "const { buildApp } = await import('./src/server.ts'); const app = await buildApp(); await app.ready(); console.log('loaded:' + typeof app.inject); await app.close();",
        ],
        {
          cwd: BACKEND_DIR,
          env: { ...process.env, DB_PATH: join(scratch, "load.sqlite"), PROJECTS_ROOT: join(scratch, "projects") },
          encoding: "utf8",
        },
      );

      expect(result.stderr).not.toMatch(/ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
      expect(result.stdout).toContain("loaded:function");
      expect(result.status).toBe(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

// configure-providers-and-parameters (JOS-174), design Decision 3 and spec "Invalid settings stop the app
// and list every problem": `providers.ts` throws when the settings are invalid, and the server imports it
// before it listens, so a real `node src/server.ts` must exit non-zero and never reach `listen`.
describe("The server and its settings files", () => {
  function scratchEnv(scratch: string, overrideJson?: string): NodeJS.ProcessEnv {
    const settingsPath = join(scratch, "settings.json");
    if (overrideJson !== undefined) writeFileSync(settingsPath, overrideJson);
    return {
      ...process.env,
      NODE_ENV: "development", // vitest sets "test", which turns the server's logger off
      PORT: "0",
      DB_PATH: join(scratch, "load.sqlite"),
      PROJECTS_ROOT: join(scratch, "projects"),
      SETTINGS_PATH: settingsPath,
    };
  }

  it("exits non-zero before listening when the override is invalid, listing every problem and no value", () => {
    const scratch = mkdtempSync(join(tmpdir(), "vid4you-bad-settings-"));
    const secret = "sk-test-secret-value";
    try {
      const result = spawnSync(process.execPath, ["src/server.ts"], {
        cwd: BACKEND_DIR,
        env: scratchEnv(scratch, JSON.stringify({ languages: [], maxSimultaneousRequests: { video: 0 }, openaiApiKey: secret })),
        encoding: "utf8",
        timeout: 30_000,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("languages: ");
      expect(result.stderr).toContain("maxSimultaneousRequests.video: ");
      expect(result.stderr).toContain("openaiApiKey: ");
      expect(result.stderr).not.toContain(secret);
      expect(result.stdout).not.toContain("listening on");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("starts and listens when there is no override file", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "vid4you-good-settings-"));
    const child = spawn(process.execPath, ["src/server.ts"], { cwd: BACKEND_DIR, env: scratchEnv(scratch) });
    try {
      let output = "";
      const listening = new Promise<void>((resolveListening, rejectListening) => {
        const timer = setTimeout(() => rejectListening(new Error(`the server did not start listening. Output so far:\n${output}`)), 25_000);
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes("listening on")) {
            clearTimeout(timer);
            resolveListening();
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.once("exit", (code) => rejectListening(new Error(`the server exited with code ${code}. Output:\n${output}`)));
      });
      await expect(listening).resolves.toBeUndefined();
    } finally {
      child.kill("SIGKILL");
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);
});
