import { describe, expect, it } from "vitest";
import { createElevenLabsAlignmentProvider } from "../src/alignmentProvider.ts";

// obtain-narration-timestamps (JOS-139), group 3 — design Decision 6: one
// multipart request to forced alignment with the stored MP3 and the locked
// script; failures classified by HTTP status (the product owner's rule); no
// retry; the reason never carries the raw body or the key.

const SCRIPT = "Hi there.";
const AUDIO = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]); // the start of an MP3 (ID3 tag)

type RecordedCall = { url: string; init: RequestInit };

function fakeFetch(response: () => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
  return { fetchFn, calls };
}

const alignedResponse = () =>
  new Response(
    JSON.stringify({
      characters: [
        { text: "H", start: 0.1, end: 0.2 },
        { text: "i", start: 0.2, end: 0.3 },
      ],
      words: [],
      loss: 0.1,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

function providerWith(fetchFn: typeof fetch, loadKey: () => string = () => "test-key", timeoutMs = 50) {
  return createElevenLabsAlignmentProvider({ fetchFn, loadKey, timeoutMs });
}

describe("The request (Decision 6)", () => {
  it("sends one multipart request with the MP3 as file, the script as text, and the credential", async () => {
    const { fetchFn, calls } = fakeFetch(alignedResponse);

    await providerWith(fetchFn).align(AUDIO, SCRIPT);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.elevenlabs.io/v1/forced-alignment");
    expect(call?.init.method).toBe("POST");
    expect((call?.init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    const body = call?.init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("text")).toBe(SCRIPT);
    const file = body.get("file") as File;
    expect(file.type).toBe("audio/mpeg");
    expect(Buffer.from(await file.arrayBuffer()).equals(AUDIO)).toBe(true);
  });

  it("returns the aligned characters", async () => {
    const { fetchFn } = fakeFetch(alignedResponse);
    expect(await providerWith(fetchFn).align(AUDIO, SCRIPT)).toEqual({
      kind: "success",
      characters: [
        { text: "H", start: 0.1, end: 0.2 },
        { text: "i", start: 0.2, end: 0.3 },
      ],
    });
  });

  it("sends the script unaltered, even with surrounding whitespace", async () => {
    const { fetchFn, calls } = fakeFetch(alignedResponse);
    await providerWith(fetchFn).align(AUDIO, "  Hi there.\n");
    expect((calls[0]?.init.body as FormData).get("text")).toBe("  Hi there.\n");
  });
});

describe("The response (Decision 6)", () => {
  it.each([
    ["content that is not JSON", () => new Response("not json", { status: 200 })],
    ["no characters", () => new Response(JSON.stringify({ words: [] }), { status: 200 })],
    ["characters without times", () => new Response(JSON.stringify({ characters: [{ text: "H" }] }), { status: 200 })],
  ])("reports %s as invalid output", async (_label, response) => {
    const { fetchFn } = fakeFetch(response);
    expect((await providerWith(fetchFn).align(AUDIO, SCRIPT)).kind).toBe("invalid_output");
  });
});

describe("Failures are classified by HTTP status (product owner rule)", () => {
  it.each([400, 401, 403, 404, 422])("classifies HTTP %i as not retryable", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("{}", { status }));
    expect((await providerWith(fetchFn).align(AUDIO, SCRIPT)).kind).toBe("failed_not_retryable");
  });

  it.each([408, 429, 500, 502, 503])("classifies HTTP %i as transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("{}", { status }));
    expect((await providerWith(fetchFn).align(AUDIO, SCRIPT)).kind).toBe("failed_transient");
  });

  it("classifies a network error as transient", async () => {
    const fetchFn = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await providerWith(fetchFn).align(AUDIO, SCRIPT)).kind).toBe("failed_transient");
  });

  it("classifies exceeding the phase limit as transient", async () => {
    const fetchFn = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const result = await providerWith(fetchFn).align(AUDIO, SCRIPT);
    expect(result).toMatchObject({ kind: "failed_transient" });
    expect(result.kind === "failed_transient" && result.reason).toMatch(/time limit/);
  });

  it("fails without sending anything when the credential is missing, naming it but revealing nothing", async () => {
    const { fetchFn, calls } = fakeFetch(alignedResponse);
    const result = await providerWith(fetchFn, () => {
      throw new Error("missing credential 'ELEVENLABS_KEY'");
    }).align(AUDIO, SCRIPT);

    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ kind: "failed_not_retryable" });
    expect(result.kind === "failed_not_retryable" && result.reason).toMatch(/ELEVENLABS_KEY/);
  });

  it("never puts the provider's raw error body or the credential in the reason", async () => {
    const { fetchFn } = fakeFetch(() => new Response('{"detail":{"message":"internal detail sk_live_999"}}', { status: 422 }));
    const result = await providerWith(fetchFn, () => "xi-SECRET-KEY").align(AUDIO, SCRIPT);
    const reason = "reason" in result ? result.reason : "";
    expect(reason).not.toMatch(/internal detail|sk_live_999|xi-SECRET-KEY/);
    expect(reason).toMatch(/422/);
  });

  it("makes exactly one request even when it fails", async () => {
    const { fetchFn, calls } = fakeFetch(() => new Response("{}", { status: 503 }));
    await providerWith(fetchFn).align(AUDIO, SCRIPT);
    expect(calls).toHaveLength(1);
  });
});
