import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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
