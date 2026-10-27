import { describe, expect, it, vi } from "vitest";
import { CONNECTION_CHECKS, type ConnectionOutcome } from "../src/providerConnectionCheck.ts";
import { ADAPTER_TYPES } from "../src/providerTypes.ts";

// test-provider-connection (JOS-220), group 2 — design Decision 2: one check per adapter type, one request, no key in the result.

const KEY = "sk-example-1234567890ab";

interface Case {
  type: string;
  parameters: Record<string, unknown>;
  host: string;
  /** The URL the one request must go to, and the method. */
  url: string;
  method: "GET" | "POST";
  /** Where the key must travel. */
  keyIn: (init: RequestInit) => boolean;
  /** The status and body that mean "connected", and the ones that mean "key rejected" (the unknown model or voice answer, when the check has one). */
  connected: { status: number; body: unknown };
  rejected: { status: number; body: unknown };
  notFound?: { status: number; body: unknown };
}

const header = (name: string, value: string) => (init: RequestInit) => (init.headers as Record<string, string>)[name] === value;

const CASES: Case[] = [
  {
    type: "openai-reasoning",
    parameters: { model: "gpt-6-astra" },
    host: "api.openai.com",
    url: "https://api.openai.com/v1/models/gpt-6-astra",
    method: "GET",
    keyIn: header("Authorization", `Bearer ${KEY}`),
    connected: { status: 200, body: { id: "gpt-6-astra" } },
    rejected: { status: 401, body: { error: { code: "invalid_api_key" } } },
    notFound: { status: 404, body: { error: { code: "model_not_found" } } },
  },
  {
    type: "elevenlabs-voice",
    parameters: { model: "eleven_multilingual_v2", voiceId: "voice123", voiceName: "Ana", outputFormat: "mp3_44100_128", speed: "default" },
    host: "api.elevenlabs.io",
    url: "https://api.elevenlabs.io/v1/voices/voice123",
    method: "GET",
    keyIn: header("xi-api-key", KEY),
    connected: { status: 200, body: { voice_id: "voice123" } },
    rejected: { status: 401, body: { detail: { status: "invalid_api_key" } } },
    notFound: { status: 400, body: { detail: { status: "voice_not_found" } } },
  },
  {
    type: "elevenlabs-alignment",
    parameters: { endpoint: "/v1/forced-alignment" },
    host: "api.elevenlabs.io",
    url: "https://api.elevenlabs.io/v1/models",
    method: "GET",
    keyIn: header("xi-api-key", KEY),
    connected: { status: 200, body: [] },
    rejected: { status: 401, body: { detail: { status: "invalid_api_key" } } },
  },
  {
    type: "fal-image",
    parameters: { model: "fal-ai/flux/dev" },
    host: "api.fal.ai",
    url: "https://api.fal.ai/v1/models?endpoint_id=fal-ai%2Fflux%2Fdev",
    method: "GET",
    keyIn: header("Authorization", `Key ${KEY}`),
    connected: { status: 200, body: { models: [{}] } },
    rejected: { status: 401, body: { error: { type: "authentication_error" } } },
    notFound: { status: 404, body: { error: { type: "not_found" } } },
  },
  {
    type: "runninghub-video",
    parameters: { endpoint: "/openapi/v2/x", admittedDurationSeconds: { min: 3, max: 10 } },
    host: "www.runninghub.ai",
    url: "https://www.runninghub.ai/uc/openapi/accountStatus",
    method: "POST",
    keyIn: (init) => JSON.parse(init.body as string).apikey === KEY,
    connected: { status: 200, body: { code: 0, msg: "success" } },
    rejected: { status: 200, body: { code: 806, msg: "APIKEY_USER_NOT_FOUND", data: null } },
  },
];

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const stubFetch = (status: number, body: unknown) => vi.fn<typeof fetch>(() => Promise.resolve(reply(status, body)));
const run = (testCase: Case, fetchFn: typeof fetch): Promise<ConnectionOutcome> =>
  CONNECTION_CHECKS[testCase.type]!.run(testCase.parameters, KEY, fetchFn, AbortSignal.timeout(10_000));

describe("every adapter type has a connection check", () => {
  it("covers the whole catalogue and nothing else", () => {
    expect(Object.keys(CONNECTION_CHECKS).sort()).toEqual(ADAPTER_TYPES.map((type) => type.id).sort());
    expect(CASES.map((testCase) => testCase.type).sort()).toEqual(ADAPTER_TYPES.map((type) => type.id).sort());
  });

  it("states whether it is charged and what it covers", () => {
    for (const check of Object.values(CONNECTION_CHECKS)) {
      expect(typeof check.charged).toBe("boolean");
      expect(check.covers.length).toBeGreaterThan(0);
    }
  });
});

describe.each(CASES)("$type connection check", (testCase) => {
  it("sends exactly one request, to the vendor host, with the key where the vendor expects it", async () => {
    const fetchFn = stubFetch(testCase.connected.status, testCase.connected.body);
    await run(testCase, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(new URL(url as string).host).toBe(testCase.host);
    expect(url).toBe(testCase.url);
    expect((init as RequestInit).method ?? "GET").toBe(testCase.method);
    expect(testCase.keyIn(init as RequestInit)).toBe(true);
    expect(String(url)).not.toContain(KEY);
  });

  it("maps a good answer to connected", async () => {
    expect(await run(testCase, stubFetch(testCase.connected.status, testCase.connected.body))).toEqual({ outcome: "connected" });
  });

  it("maps a rejected key to key-rejected", async () => {
    expect(await run(testCase, stubFetch(testCase.rejected.status, testCase.rejected.body))).toEqual({ outcome: "key-rejected" });
  });

  it("maps 403 to key-rejected on the checks that answer with a status", async () => {
    if (testCase.type === "runninghub-video") return;
    expect(await run(testCase, stubFetch(403, {}))).toEqual({ outcome: "key-rejected" });
  });

  it("maps an unknown model or voice to not-found, only where the check looks one up", async () => {
    if (!testCase.notFound) return;
    expect(await run(testCase, stubFetch(testCase.notFound.status, testCase.notFound.body))).toEqual({ outcome: "not-found" });
  });

  it("maps any other status to unexpected, with the status only", async () => {
    const result = await run(testCase, stubFetch(500, { detail: KEY }));
    expect(result).toEqual({ outcome: "unexpected", httpStatus: 500 });
  });

  it("maps a network error to unreachable, without a second request", async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed")));
    expect(await run(testCase, fetchFn)).toEqual({ outcome: "unreachable" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps a timeout to unreachable", async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new DOMException("The operation timed out", "TimeoutError")));
    expect(await run(testCase, fetchFn)).toEqual({ outcome: "unreachable" });
  });
});

describe("the checks that cannot look up a model or voice", () => {
  it("map 404 to unexpected, not not-found", async () => {
    for (const type of ["elevenlabs-alignment", "runninghub-video"]) {
      const testCase = CASES.find((candidate) => candidate.type === type)!;
      expect(await run(testCase, stubFetch(404, {}))).toEqual({ outcome: "unexpected", httpStatus: 404 });
    }
  });

  it("treat a RunningHub 200 with another non-zero code as unexpected", async () => {
    const testCase = CASES.find((candidate) => candidate.type === "runninghub-video")!;
    expect(await run(testCase, stubFetch(200, { code: 999 }))).toEqual({ outcome: "unexpected", httpStatus: 200 });
  });
});
