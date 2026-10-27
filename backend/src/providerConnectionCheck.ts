// test-provider-connection (JOS-220), design Decisions 2 and 5 — one connection check per adapter type. Each check sends
// exactly one request to its vendor's own host (kept here, like the adapters do), built from constants and the profile's
// validated parameters, so a key can only go to that vendor. The vendor's raw answer is read for the fields below and
// never returned.

export type ConnectionOutcomeName = "connected" | "key-rejected" | "not-found" | "unreachable" | "unexpected";

export interface ConnectionOutcome {
  outcome: ConnectionOutcomeName;
  /** Only for `unexpected`. */
  httpStatus?: number;
}

export interface ConnectionCheck {
  /** Whether the vendor charges for the request. */
  charged: boolean;
  /** What a pass proves, in words for the Administrator. */
  covers: string;
  run(parameters: Record<string, unknown>, key: string, fetchFn: typeof fetch, signal: AbortSignal): Promise<ConnectionOutcome>;
}

const CHECK_TIMEOUT_MS = 10_000;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Sends the one request and maps its answer; `isNotFound` says which answers mean an unknown model or voice. */
async function lookup(
  fetchFn: typeof fetch,
  signal: AbortSignal,
  url: string,
  init: RequestInit,
  isNotFound?: (status: number, body: unknown) => boolean,
): Promise<ConnectionOutcome> {
  let response: Response;
  try {
    response = await fetchFn(url, { ...init, signal });
  } catch {
    return { outcome: "unreachable" };
  }
  if (response.ok) return { outcome: "connected" };
  if (response.status === 401 || response.status === 403) return { outcome: "key-rejected" };
  if (isNotFound?.(response.status, await readJson(response))) return { outcome: "not-found" };
  return { outcome: "unexpected", httpStatus: response.status };
}

const bodyField = (body: unknown, path: string[]): unknown => path.reduce<unknown>((value, name) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[name] : undefined), body);

export const CONNECTION_CHECKS: Record<string, ConnectionCheck> = {
  "openai-reasoning": {
    charged: false,
    covers: "The key and the model were checked.",
    run: (parameters, key, fetchFn, signal) =>
      lookup(fetchFn, signal, `https://api.openai.com/v1/models/${encodeURIComponent(String(parameters.model))}`, { headers: { Authorization: `Bearer ${key}` } }, (status) => status === 404),
  },
  "elevenlabs-voice": {
    charged: false,
    covers: "The key and the voice were checked. The voice model was not.",
    run: (parameters, key, fetchFn, signal) =>
      lookup(fetchFn, signal, `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(String(parameters.voiceId))}`, { headers: { "xi-api-key": key } }, (status, body) => status === 404 || (status === 400 && bodyField(body, ["detail", "status"]) === "voice_not_found")),
  },
  "elevenlabs-alignment": {
    charged: false,
    covers: "Only the key was checked. The endpoint was not.",
    run: (_parameters, key, fetchFn, signal) => lookup(fetchFn, signal, "https://api.elevenlabs.io/v1/models", { headers: { "xi-api-key": key } }),
  },
  "fal-image": {
    charged: false,
    covers: "The key and the model were checked.",
    run: (parameters, key, fetchFn, signal) =>
      lookup(fetchFn, signal, `https://api.fal.ai/v1/models?endpoint_id=${encodeURIComponent(String(parameters.model))}`, { headers: { Authorization: `Key ${key}` } }, (status) => status === 404),
  },
  "runninghub-video": {
    charged: false,
    covers: "Only the key was checked. The endpoint was not.",
    // RunningHub answers 200 for every key and signals the result in the body: code 0 is a good key, 806 an unknown one.
    run: async (_parameters, key, fetchFn, signal) => {
      let response: Response;
      try {
        response = await fetchFn("https://www.runninghub.ai/uc/openapi/accountStatus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apikey: key }), signal });
      } catch {
        return { outcome: "unreachable" };
      }
      if (!response.ok) return { outcome: "unexpected", httpStatus: response.status };
      const code = bodyField(await readJson(response), ["code"]);
      if (code === 0) return { outcome: "connected" };
      if (code === 806) return { outcome: "key-rejected" };
      return { outcome: "unexpected", httpStatus: response.status };
    },
  },
};

let checkFetch: typeof fetch = fetch;

/** Tests count the requests through a stub instead of reaching a vendor. */
export function setConnectionCheckFetch(fetchFn: typeof fetch): void {
  checkFetch = fetchFn;
}

export function resetConnectionCheckFetch(): void {
  checkFetch = fetch;
}

/** The one entry point of the route: runs the check of an adapter type with the time limit. */
export function runConnectionCheck(adapterType: string, parameters: Record<string, unknown>, key: string): Promise<ConnectionOutcome> {
  return CONNECTION_CHECKS[adapterType]!.run(parameters, key, checkFetch, AbortSignal.timeout(CHECK_TIMEOUT_MS));
}
