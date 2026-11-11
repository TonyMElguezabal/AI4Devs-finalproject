import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// add-package-smoke-ci (JOS-279) — starts the smoke flavor built by `npm run package:smoke` on a scratch data folder and runs
// one session through it: the embedded page loads, the session reaches `final-video`, the video downloads. Usage:
// `node packaging/smokeRun.ts <folder holding the Vid4You executable>`; exit code 1 and the executable's log on any failure.

const PORT = 3102; // not the product's 3100, so a developer's own copy is never mistaken for this one
const START_TIMEOUT_MS = 60_000;
const SESSION_TIMEOUT_MS = 90_000;

/** A reason to stop waiting at once; any other error from a probe (the server not listening yet) just means "not yet". */
class Fatal extends Error {}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: string, timeoutMs: number, probe: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe().catch((error: unknown) => {
      if (error instanceof Fatal) throw error;
      return undefined;
    });
    if (value !== undefined) return value;
    await sleep(250);
  }
  throw new Error(`timed out after ${timeoutMs / 1000} s waiting for ${what}`);
}

async function main(folder: string): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "vid4you-smoke-"));
  const executable = join(folder, process.platform === "win32" ? "Vid4You.exe" : "Vid4You");
  const child = spawn(executable, [], {
    env: { ...process.env, VID4YOU_DATA_DIR: dataDir, VID4YOU_PORT: String(PORT), VID4YOU_NO_BROWSER: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  let spawnError: Error | undefined;
  child.once("error", (error) => (spawnError = error)); // e.g. the executable does not exist
  child.stdout.on("data", (chunk: Buffer) => (log += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (log += chunk.toString()));
  const base = `http://127.0.0.1:${PORT}`;
  try {
    await until("the executable to answer /health", START_TIMEOUT_MS, async () => {
      if (spawnError) throw new Fatal(`the executable did not start: ${spawnError.message}`);
      if (child.exitCode !== null) throw new Fatal(`the executable exited with code ${child.exitCode}`);
      return (await fetch(`${base}/health`)).ok ? true : undefined;
    });

    const page = await fetch(`${base}/`);
    const html = await page.text();
    if (!page.ok || !html.includes('id="root"')) throw new Error(`the embedded page did not load (status ${page.status})`);

    const created = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Smoke", script: "A calm sea tonight.", language: "en" }),
    });
    if (created.status !== 201) throw new Error(`POST /sessions answered ${created.status}: ${await created.text()}`);
    const { sessionId } = ((await created.json()) as { session: { sessionId: string } }).session;

    const done = await until("the session to reach final-video", SESSION_TIMEOUT_MS, async () => {
      const { session } = (await (await fetch(`${base}/sessions/${sessionId}`)).json()) as { session: { state: string; finalVideoUrl?: string } };
      if (session.state === "failed") throw new Fatal(`the session failed: ${JSON.stringify(session)}`);
      return session.state === "final-video" ? session : undefined;
    });
    const video = await fetch(`${base}${done.finalVideoUrl}`);
    const size = (await video.arrayBuffer()).byteLength;
    if (!video.ok || size === 0) throw new Error(`the final video did not download (status ${video.status}, ${size} bytes)`);
    console.log(`smoke run passed: ${sessionId} reached final-video, ${size} bytes`);
  } catch (error) {
    console.error(`smoke run failed: ${(error as Error).message}\n--- executable log ---\n${log}`);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    await sleep(500);
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(dataDir, { recursive: true, force: true });
  }
}

const folder = process.argv[2];
if (!folder) {
  console.error("usage: node packaging/smokeRun.ts <folder holding the Vid4You executable>");
  process.exit(2);
}
await main(folder);
