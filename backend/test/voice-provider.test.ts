import { describe, expect, it } from "vitest";
import { createElevenLabsVoiceProvider, createStubVoiceProvider, type VoiceSynthesisRequest } from "../src/voiceProvider.ts";

// generate-voice-over (JOS-136), group 4 — the voice port, its stub and the
// ElevenLabs adapter: one synchronous HTTP request per attempt, the recorded
// voice/model/format, the credential read only through the loader, and the
// product owner's HTTP-status classification (design Decision 4: 4xx except
// 408/429 is not retryable, everything else transient). No SDK, no built-in
// retry.

const REQUEST: VoiceSynthesisRequest = {
  text: "The sun rose slowly over the quiet hills.",
  language: "en",
  voiceId: "4YYIPFl9wE5c4L2eu2Gb",
  model: "eleven_multilingual_v2",
  outputFormat: "mp3_44100_128",
  speed: "default",
};

type RecordedCall = { url: string; init: RequestInit };

function fakeFetch(response: () => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
  return { fetchFn, calls };
}

const AUDIO = Buffer.from("fake-mp3-bytes");
const ALIGNMENT = {
  characters: ["T", "h", "e"],
  character_start_times_seconds: [0, 0.1, 0.2],
  character_end_times_seconds: [0.1, 0.2, 0.3],
};

function successResponse(body: Record<string, unknown> = { audio_base64: AUDIO.toString("base64"), alignment: ALIGNMENT }) {
  return () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", "request-id": "req-abc" } });
}

function providerWith(fetchFn: typeof fetch, loadKey: () => string = () => "test-key", timeoutMs = 50) {
  return createElevenLabsVoiceProvider({ fetchFn, loadKey, timeoutMs });
}

describe("The ElevenLabs request", () => {
  it("sends one POST with the script as text, the recorded voice, model and format, the language, and the credential", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse());

    await providerWith(fetchFn).synthesize(REQUEST);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/4YYIPFl9wE5c4L2eu2Gb/with-timestamps?output_format=mp3_44100_128",
    );
    expect(call?.init.method).toBe("POST");
    expect((call?.init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(call?.init.body as string)).toEqual({
      text: REQUEST.text,
      model_id: "eleven_multilingual_v2",
      language_code: "en",
    });
  });

  it("sends the script exactly as given, untrimmed and unnormalised", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse());
    const script = "  Line one.\n\nLine two,  with   spaces.  ";

    await providerWith(fetchFn).synthesize({ ...REQUEST, text: script });

    expect(JSON.parse(calls[0]?.init.body as string).text).toBe(script);
  });

  it("sets no time limit unless one is given, because the story sends scripts of any length", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse());

    await createElevenLabsVoiceProvider({ fetchFn, loadKey: () => "test-key" }).synthesize(REQUEST);

    expect(calls[0]?.init.signal).toBeUndefined();
  });

  it("sends a numeric speed in voice_settings and omits it for the provider default", async () => {
    const withSpeed = fakeFetch(successResponse());
    await providerWith(withSpeed.fetchFn).synthesize({ ...REQUEST, speed: 1.1 });
    expect(JSON.parse(withSpeed.calls[0]?.init.body as string).voice_settings).toEqual({ speed: 1.1 });

    const withDefault = fakeFetch(successResponse());
    await providerWith(withDefault.fetchFn).synthesize(REQUEST);
    expect(JSON.parse(withDefault.calls[0]?.init.body as string)).not.toHaveProperty("voice_settings");
  });
});

describe("A successful response", () => {
  it("returns the decoded audio, the provider request id and the native timestamps unmodified", async () => {
    const { fetchFn } = fakeFetch(successResponse());

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(Buffer.from(result.audio).equals(AUDIO)).toBe(true);
    expect(result.providerRequestId).toBe("req-abc");
    expect(result.nativeTimestamps).toEqual(ALIGNMENT);
  });

  it("returns no timestamps when the response carries none", async () => {
    const { fetchFn } = fakeFetch(successResponse({ audio_base64: AUDIO.toString("base64") }));

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.nativeTimestamps).toBeUndefined();
  });

  it("returns no provider request id when the response header is absent", async () => {
    const { fetchFn } = fakeFetch(() => new Response(JSON.stringify({ audio_base64: AUDIO.toString("base64") }), { status: 200 }));

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(result.kind === "success" && result.providerRequestId).toBeUndefined();
  });

  it("treats a success response without audio as a transient failure", async () => {
    const { fetchFn } = fakeFetch(successResponse({ alignment: ALIGNMENT }));

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(result.kind).toBe("failed_transient");
  });

  it("treats a success response that is not JSON as a transient failure", async () => {
    const { fetchFn } = fakeFetch(() => new Response("not json", { status: 200 }));

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(result.kind).toBe("failed_transient");
  });
});

describe("Failure classification by HTTP status (design Decision 4)", () => {
  it.each([400, 401, 402, 403, 404, 413, 422])("HTTP %i is not retryable", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("provider detail", { status }));

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(result.kind).toBe("failed_not_retryable");
    if (result.kind !== "failed_not_retryable") return;
    expect(result.reason).toContain(String(status));
  });

  it.each([408, 429, 500, 502, 503, 504])("HTTP %i is transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("provider detail", { status }));

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(result.kind).toBe("failed_transient");
  });

  it("a network error is transient", async () => {
    const result = await providerWith((async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch).synthesize(REQUEST);

    expect(result).toEqual({ kind: "failed_transient", reason: "the voice provider could not be reached" });
  });

  it("a timeout is transient", async () => {
    const hangs = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;

    const result = await providerWith(hangs, () => "test-key", 20).synthesize(REQUEST);

    expect(result.kind).toBe("failed_transient");
    if (result.kind === "failed_transient") expect(result.reason).toContain("time limit");
  });

  it("never copies the provider's body into the reason", async () => {
    const { fetchFn } = fakeFetch(() => new Response("raw detail containing the script text", { status: 400 }));

    const result = await providerWith(fetchFn).synthesize(REQUEST);

    expect(JSON.stringify(result)).not.toContain("raw detail");
  });

  it("reports a length refusal as an ordinary not-retryable 4xx with its cause, and sends nothing shortened", async () => {
    const { fetchFn, calls } = fakeFetch(() => new Response("{}", { status: 413 }));
    const longScript = "word ".repeat(5000);

    const result = await providerWith(fetchFn).synthesize({ ...REQUEST, text: longScript });

    expect(result.kind).toBe("failed_not_retryable");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.init.body as string).text).toBe(longScript);
  });
});

describe("The credential", () => {
  it("is read only through the loader, and a missing one sends nothing and names the credential without a value", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse());

    const result = await providerWith(fetchFn, () => {
      throw new Error("missing credential 'ELEVENLABS_KEY': set it in the local environment or in the local secrets file (never in the repository)");
    }).synthesize(REQUEST);

    expect(calls).toHaveLength(0);
    expect(result.kind).toBe("failed_not_retryable");
    if (result.kind === "failed_not_retryable") expect(result.reason).toContain("ELEVENLABS_KEY");
  });

  it("is never part of the failure reason", async () => {
    const { fetchFn } = fakeFetch(() => new Response("{}", { status: 401 }));

    const result = await providerWith(fetchFn, () => "super-secret-key-value").synthesize(REQUEST);

    expect(JSON.stringify(result)).not.toContain("super-secret-key-value");
  });
});

describe("The stub provider", () => {
  it("records every request it receives", async () => {
    const stub = createStubVoiceProvider("success");

    await stub.synthesize(REQUEST);

    expect(stub.calls).toEqual([REQUEST]);
  });

  it("succeeds with audio and native timestamps", async () => {
    const result = await createStubVoiceProvider("success").synthesize(REQUEST);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.audio.byteLength).toBeGreaterThan(0);
    expect(result.nativeTimestamps).toBeDefined();
    expect(result.providerRequestId).toBeDefined();
  });

  it("succeeds without timestamps", async () => {
    const result = await createStubVoiceProvider("success-without-timestamps").synthesize(REQUEST);

    expect(result.kind === "success" && result.nativeTimestamps).toBeUndefined();
  });

  it("fails transiently", async () => {
    expect((await createStubVoiceProvider("transient-failure").synthesize(REQUEST)).kind).toBe("failed_transient");
  });

  it("fails as not retryable", async () => {
    expect((await createStubVoiceProvider("not-retryable-failure").synthesize(REQUEST)).kind).toBe("failed_not_retryable");
  });

  it("returns undecodable audio on success", async () => {
    const result = await createStubVoiceProvider("undecodable-audio").synthesize(REQUEST);

    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.audio.byteLength).toBeGreaterThan(0);
  });

  it("returns zero-length audio on success", async () => {
    const result = await createStubVoiceProvider("empty-audio").synthesize(REQUEST);

    expect(result.kind === "success" && result.audio.byteLength).toBe(0);
  });

  it("holds the request until released, so a test can observe the in-flight state", async () => {
    const stub = createStubVoiceProvider("hang");
    let settled = false;
    const pending = stub.synthesize(REQUEST).then((result) => {
      settled = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    stub.release();
    expect((await pending).kind).toBe("success");
  });
});
