import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// verify-internal-workflow (JOS-243), design D6 — the real `node src/server.ts` on its own scratch folders, every provider
// stubbed by environment variable, driven over HTTP. Nothing reads or writes the Developer's `data/` or `.secrets.json`.

const BACKEND_DIR = resolve(import.meta.dirname, "..");
const STARTUP_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;

/**
 * At most 19 characters: the stub voice gives each character 0.05 s of native timestamps on a narration of about 1 s, and
 * the product rejects timestamps that end after the narration (design D6).
 */
export const WORKFLOW_SCRIPT = "A calm sea tonight.";

/** Every provider stubbed to succeed; a test overrides one to make a stage fail. */
export const ALL_STUBS_SUCCEEDING: Record<string, string> = {
  USE_STUB_SCRIPT_MODERATION: "clean",
  USE_STUB_VOICE_PROVIDER: "success",
  USE_STUB_DECOMPOSITION: "success",
  USE_STUB_IMAGE_PROVIDER: "success",
  USE_STUB_VIDEO_PROVIDER: "success",
  USE_STUB_ASSEMBLY_TOOL: "success",
};

export interface WorkflowServer {
  baseUrl: string;
  scratch: string;
  /** stdout and stderr so far, for failure messages. */
  output(): string;
  /** Kills the server, waits for it to exit and removes the scratch folder. Safe to call twice. */
  stop(): Promise<void>;
}

export class WaitTimeoutError extends Error {}

/** Polls `read` until `done` holds; at the bound it throws with the last value read. Never a fixed sleep. */
export async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  options: { timeoutMs: number; intervalMs: number; what: string },
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  let last: T | undefined;
  for (;;) {
    last = await read();
    if (done(last)) return last;
    if (Date.now() >= deadline) {
      throw new WaitTimeoutError(`timed out after ${options.timeoutMs} ms waiting for ${options.what}; last value: ${JSON.stringify(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

export async function startWorkflowServer(stubs: Record<string, string>): Promise<WorkflowServer> {
  const scratch = mkdtempSync(join(tmpdir(), "vid4you-workflow-"));
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("USE_STUB_")));
  const child = spawn(process.execPath, ["src/server.ts"], {
    cwd: BACKEND_DIR,
    env: {
      ...inherited,
      NODE_ENV: "development", // vitest sets "test", which turns the server's logger and log file off
      PORT: "0",
      DB_PATH: join(scratch, "db.sqlite"),
      PROJECTS_ROOT: join(scratch, "projects"),
      SETTINGS_PATH: join(scratch, "settings.json"), // absent: the shipped defaults
      SECRETS_PATH: join(scratch, "secrets.json"), // absent: no provider key at all
      VID4YOU_TELEMETRY_ENDPOINT: "http://127.0.0.1:9", // nothing is exported without consent; if it were, it goes nowhere
      RETRY_BASE_DELAY_SECONDS: "0",
      RETRY_CAP_DELAY_SECONDS: "0",
      ...stubs,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  let stopped = false;

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const killed = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
      await exited;
      clearTimeout(killed);
    }
    rmSync(scratch, { recursive: true, force: true });
  };

  try {
    // The server's own `listening on` line prints the PORT constant (0 here); Fastify's line has the real port.
    const listening = await waitFor(
      () => Promise.resolve(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1] ?? (child.exitCode !== null ? "exited" : undefined)),
      (url) => url !== undefined,
      { timeoutMs: STARTUP_TIMEOUT_MS, intervalMs: 50, what: "the server to listen" },
    );
    if (listening === "exited") throw new Error(`the server exited before listening:\n${output}`);
    return { baseUrl: listening!, scratch, output: () => output, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** The top-level entries of a folder and their modification times, to prove a run left it untouched. */
export function folderFingerprint(dir: string): Record<string, number> | null {
  if (!existsSync(dir)) return null;
  return Object.fromEntries(readdirSync(dir).map((name) => [name, statSync(join(dir, name)).mtimeMs]));
}

export const DEVELOPER_DATA_DIR = join(BACKEND_DIR, "data");
