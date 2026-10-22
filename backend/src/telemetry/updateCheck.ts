import { BUILD, type BuildConfig } from "../config/build.ts";

// add-observability-telemetry (JOS-199), design Decision 9 — one call to the public GitHub Releases API per
// launch, made by the backend so many open tabs still mean one call. "Newer" means a different tag, because L7
// names UAT pre-releases by tree hash. Any failure is `available: false` plus one local log line, never an error.
export type UpdateResult = { available: false } | { available: true; tag: string; url: string };
/** The fields of a GitHub release this check reads. */
interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  prerelease?: boolean;
}
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const NOT_AVAILABLE: UpdateResult = { available: false };
let pending: Promise<UpdateResult> | null = null;

export async function checkForUpdate(
  build: BuildConfig,
  fetchImpl: FetchLike = fetch,
  warn: (message: string) => void = (message) => console.warn(message),
): Promise<UpdateResult> {
  if (build.channel === "development" || !build.releaseTag) return NOT_AVAILABLE;
  const base = `https://api.github.com/repos/${build.repository}/releases`;
  const url = build.channel === "production" ? `${base}/latest` : `${base}?per_page=20`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "vid4you-update-check" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const body = (await response.json()) as GithubRelease | GithubRelease[];
    const release = build.channel === "production" ? (body as GithubRelease) : (body as GithubRelease[]).find((entry) => entry.prerelease === true);
    if (!release?.tag_name || release.tag_name === build.releaseTag) return NOT_AVAILABLE;
    return { available: true, tag: String(release.tag_name), url: String(release.html_url) };
  } catch (err) {
    warn(`update check failed: ${(err as Error).message}`);
    return NOT_AVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}

/** Starts the launch check without awaiting it, so it never delays `listen`. */
export function startUpdateCheck(build: BuildConfig = BUILD, fetchImpl: FetchLike = fetch): void {
  pending = checkForUpdate(build, fetchImpl);
}

export async function getUpdateResult(): Promise<UpdateResult> {
  return pending ? await pending : NOT_AVAILABLE;
}

export function resetUpdateCheckForTest(): void {
  pending = null;
}
