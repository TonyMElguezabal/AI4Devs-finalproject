import { readFileSync } from "node:fs";
import { join } from "node:path";

// configurable-video-connector (JOS-219), design Decision 1 — the definitions in docs/video-connector-definitions.md are the
// fixtures, so a definition the docs show is one the tests pass.

const DOC = readFileSync(join(import.meta.dirname, "../../docs/video-connector-definitions.md"), "utf8");

/** The `requests` JSON that follows `<!-- fixture: name -->` in the docs page. */
export function definitionRequests(name: "runway" | "runninghub" | "minimax"): Record<string, unknown> {
  const match = new RegExp(`<!-- fixture: ${name} -->\\s*\`\`\`json\\n([\\s\\S]*?)\`\`\``).exec(DOC);
  if (!match) throw new Error(`no fixture "${name}" in docs/video-connector-definitions.md`);
  return JSON.parse(match[1]!) as Record<string, unknown>;
}

/** The whole parameter set of a connector profile, as the Administrator saves it on /admin. */
export function runwayParameters(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseUrl: "https://api.dev.runwayml.com",
    model: "wan3",
    resolution: "auto_720p",
    admittedDurationSeconds: { min: 5, max: 15 },
    requests: definitionRequests("runway"),
    ...overrides,
  };
}

export function runningHubParameters(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseUrl: "https://www.runninghub.ai",
    model: "minimax/hailuo-h3",
    resolution: "768P",
    admittedDurationSeconds: { min: 5, max: 15 },
    requests: definitionRequests("runninghub"),
    ...overrides,
  };
}

export function miniMaxParameters(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseUrl: "https://api.minimax.io",
    model: "MiniMax-H3",
    resolution: "768P",
    admittedDurationSeconds: { min: 5, max: 15 },
    requests: definitionRequests("minimax"),
    ...overrides,
  };
}

/** A copy of a definition's `requests` with one step's fields replaced. */
export function withStep(requests: Record<string, unknown>, step: string, fields: Record<string, unknown> | null): Record<string, unknown> {
  if (fields === null) {
    const copy = { ...requests };
    delete copy[step];
    return copy;
  }
  return { ...requests, [step]: { ...(requests[step] as Record<string, unknown>), ...fields } };
}

/** A fetch stub that records every request and answers from a function of the URL and the request. */
export function recordingFetch(answer: (url: string, init: RequestInit) => Response) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });
    return answer(String(url), init);
  }) as typeof fetch;
  return { fetchFn, requests };
}

export const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
