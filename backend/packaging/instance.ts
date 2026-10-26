import { spawn } from "node:child_process";

// package-executables-build (JOS-205) — one backend per user: a second launch opens the running one and leaves.

/** True when something on the port answers `GET /health` with `{"ok":true}` (another program on the port does not count). */
export async function isAlreadyRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

export function openBrowser(url: string, env: Record<string, string | undefined> = process.env, platform: NodeJS.Platform = process.platform): void {
  if (env.VID4YOU_NO_BROWSER === "1") return;
  const [command, args] = platform === "darwin" ? ["open", [url]] as const
    : platform === "win32" ? ["cmd", ["/c", "start", "", url]] as const
      : ["xdg-open", [url]] as const;
  spawn(command, [...args], { detached: true, stdio: "ignore" }).unref();
}
