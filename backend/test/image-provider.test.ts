import { afterEach, describe, expect, it } from "vitest";
import {
  createFalAiImageProvider,
  createStubImageProvider,
  downloadGeneratedImage,
  resetDownloadFetch,
  setDownloadFetch,
} from "../src/imageProvider.ts";

// generate-chunk-image (JOS-145), group 3 — the Fal.ai adapter: one
// synchronous HTTP request per attempt, the recorded request size
// (1920x1088), the credential read only through the loader, and the
// product owner's HTTP-status classification (4xx except 408/429 is not
// retryable, everything else transient). No SDK, no built-in retry.

const INSTRUCTION = "A lighthouse at dusk, waves breaking against the rocks";

type RecordedCall = { url: string; init: RequestInit };

function fakeFetch(response: () => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
  return { fetchFn, calls };
}

const successResponse = () =>
  new Response(JSON.stringify({ images: [{ url: "https://fal.media/files/abc/image.jpeg" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function providerWith(fetchFn: typeof fetch, loadKey: () => string = () => "test-key", timeoutMs = 50) {
  return createFalAiImageProvider({ fetchFn, loadKey, timeoutMs });
}

describe("The request", () => {
  it("sends one POST with the instruction as prompt, the recorded request size, and the credential", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse);

    await providerWith(fetchFn).generate(INSTRUCTION);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://fal.run/fal-ai/flux/dev");
    expect(call?.init.method).toBe("POST");
    expect((call?.init.headers as Record<string, string>).Authorization).toBe("Key test-key");
    const body = JSON.parse(call?.init.body as string);
    expect(body).toEqual({ prompt: INSTRUCTION, image_size: { width: 1920, height: 1088 } });
  });

  it("returns the returned image as a temporary URL, never trusting any width/height in the response", async () => {
    const { fetchFn } = fakeFetch(() =>
      new Response(JSON.stringify({ images: [{ url: "https://fal.media/files/abc/image.jpeg", width: 999, height: 999 }] }), {
        status: 200,
      }),
    );

    const result = await providerWith(fetchFn).generate(INSTRUCTION);

    expect(result).toEqual({ kind: "success", image: { source: "temporary-url", url: "https://fal.media/files/abc/image.jpeg" } });
  });

  it("fails not-retryable when the credential is missing, and sends no request", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse);

    const result = await providerWith(fetchFn, () => {
      throw new Error("missing credential 'FAL_API_KEY': set it in the local environment or in the local secrets file");
    }).generate(INSTRUCTION);

    expect(result.kind).toBe("failed_not_retryable");
    expect(calls).toHaveLength(0);
  });
});

describe("Failure classification (product owner rule: 4xx except 408/429 not retryable, else transient)", () => {
  it.each([400, 401, 403, 404, 422])("HTTP %d is not retryable", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    expect(await providerWith(fetchFn).generate(INSTRUCTION)).toEqual({
      kind: "failed_not_retryable",
      reason: `the image provider answered HTTP ${status}`,
    });
  });

  it.each([408, 429])("HTTP %d is transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    expect(await providerWith(fetchFn).generate(INSTRUCTION)).toEqual({
      kind: "failed_transient",
      reason: `the image provider answered HTTP ${status}`,
    });
  });

  it.each([500, 502, 503])("HTTP %d is transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    expect(await providerWith(fetchFn).generate(INSTRUCTION)).toEqual({
      kind: "failed_transient",
      reason: `the image provider answered HTTP ${status}`,
    });
  });

  it("a network error is transient", async () => {
    const fetchFn = (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;
    const result = await providerWith(fetchFn).generate(INSTRUCTION);
    expect(result).toEqual({ kind: "failed_transient", reason: "the image provider could not be reached" });
  });

  it("an unexpected response shape is transient", async () => {
    const { fetchFn } = fakeFetch(() => new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    const result = await providerWith(fetchFn).generate(INSTRUCTION);
    expect(result.kind).toBe("failed_transient");
  });
});

// group 3, task 3.2 — the stub every later group's tests configure instead
// of the real adapter. "Under-size image", "portrait image" and "download
// failure" are not separate modes: they are exercised by configuring what
// bytes/URL success-bytes/success-temporary-url returns, and how the
// orchestrator's own download step behaves.
describe("The stub adapter (group 3, task 3.2)", () => {
  it("success-bytes returns the configured bytes and content type", async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const result = await createStubImageProvider("success-bytes", { bytes, contentType: "image/jpeg" }).generate(INSTRUCTION);
    expect(result).toEqual({ kind: "success", image: { source: "bytes", bytes, contentType: "image/jpeg" } });
  });

  it("success-temporary-url returns the configured URL", async () => {
    const result = await createStubImageProvider("success-temporary-url", { url: "https://example.test/x.jpg" }).generate(
      INSTRUCTION,
    );
    expect(result).toEqual({ kind: "success", image: { source: "temporary-url", url: "https://example.test/x.jpg" } });
  });

  it("success-temporary-url falls back to a default URL when none is configured", async () => {
    const result = await createStubImageProvider("success-temporary-url").generate(INSTRUCTION);
    expect(result).toEqual({ kind: "success", image: { source: "temporary-url", url: "https://fal.media/files/stub.jpg" } });
  });

  it("transient-failure and not-retryable-failure return their classified outcome", async () => {
    expect((await createStubImageProvider("transient-failure").generate(INSTRUCTION)).kind).toBe("failed_transient");
    expect((await createStubImageProvider("not-retryable-failure").generate(INSTRUCTION)).kind).toBe("failed_not_retryable");
  });

  it("records every instruction it was called with", async () => {
    const stub = createStubImageProvider("success-bytes");
    await stub.generate("first");
    await stub.generate("second");
    expect(stub.calls).toEqual(["first", "second"]);
  });
});

// §12.2 — resolving a temporary-link result to bytes before the image stage
// can succeed (design Decision 6). Exercised end-to-end in
// `test/image-stage.test.ts`; these are the direct unit tests.
describe("downloadGeneratedImage (§12.2)", () => {
  afterEach(() => {
    resetDownloadFetch();
  });

  it("downloads the bytes and content type on success", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    setDownloadFetch((async () => new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } })) as typeof fetch);

    const result = await downloadGeneratedImage("https://fal.media/files/example.jpg");

    expect(result).toEqual({ ok: true, bytes: Buffer.from(bytes), contentType: "image/jpeg" });
  });

  it("fails when the response is not ok", async () => {
    setDownloadFetch((async () => new Response("", { status: 404 })) as typeof fetch);

    const result = await downloadGeneratedImage("https://fal.media/files/missing.jpg");

    expect(result).toEqual({ ok: false, reason: "downloading the generated image answered HTTP 404" });
  });

  it("fails when the download itself throws (a network error, not an HTTP error)", async () => {
    setDownloadFetch((async () => {
      throw new Error("network unreachable");
    }) as typeof fetch);

    const result = await downloadGeneratedImage("https://fal.media/files/example.jpg");

    expect(result).toEqual({ ok: false, reason: "the generated image could not be downloaded" });
  });
});
