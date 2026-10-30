import { afterEach, describe, expect, it } from "vitest";
import { clearReferenceImage, saveReferenceImage, saveVisualStylePrompt } from "../src/db.ts";
import {
  createFalAiImageProvider,
  createStubImageProvider,
  downloadGeneratedImage,
  resetDownloadFetch,
  setDownloadFetch,
} from "../src/imageProvider.ts";
import { IMAGE_REFERENCE_MODEL } from "../src/config/providers.ts";

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

// follow-fal-image-queue (JOS-239): an attempt is a submission to the queue; the status / result / cancel round trip is in image-provider-queue.test.ts.
const successResponse = () =>
  new Response(
    JSON.stringify({
      request_id: "request-1",
      status_url: "https://queue.fal.run/fal-ai/flux/requests/request-1/status",
      response_url: "https://queue.fal.run/fal-ai/flux/requests/request-1",
      cancel_url: "https://queue.fal.run/fal-ai/flux/requests/request-1/cancel",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

function providerWith(fetchFn: typeof fetch, loadKey: () => string = () => "test-key") {
  return createFalAiImageProvider({ fetchFn, loadKey });
}

describe("The request is unaffected by the /admin settings (JOS-201, AC 8)", () => {
  it("sends the same URL, headers and body with a saved style and a stored reference image as without", async () => {
    const sendOnce = async () => {
      const { fetchFn, calls } = fakeFetch(successResponse);
      await providerWith(fetchFn).submit(INSTRUCTION);
      const { url, init } = calls[0]!; // the abort signal is per-call, so it is not part of the comparison
      return { url, method: init.method, headers: init.headers, body: init.body };
    };
    saveVisualStylePrompt("");
    clearReferenceImage();
    const baseline = await sendOnce();
    saveVisualStylePrompt("Warry, a 2D cartoon caricature in a navy suit");
    saveReferenceImage("admin/reference-image.png", "image/png");
    try {
      const withSettings = await sendOnce();
      expect(withSettings).toEqual(baseline);
    } finally {
      saveVisualStylePrompt("");
      clearReferenceImage();
    }
  });
});

describe("The request", () => {
  it("sends one POST with the instruction as prompt, the recorded request size, and the credential", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse);

    await providerWith(fetchFn).submit(INSTRUCTION);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://queue.fal.run/fal-ai/flux/dev");
    expect(call?.init.method).toBe("POST");
    expect((call?.init.headers as Record<string, string>).Authorization).toBe("Key test-key");
    const body = JSON.parse(call?.init.body as string);
    expect(body).toEqual({ prompt: INSTRUCTION, image_size: { width: 1920, height: 1088 } });
  });

  it("fails not-retryable when the credential is missing, and sends no request", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse);

    const result = await providerWith(fetchFn, () => {
      throw new Error("missing credential 'FAL_API_KEY': set it in the local environment or in the local secrets file");
    }).submit(INSTRUCTION);

    expect(result.kind).toBe("failed_not_retryable");
    expect(calls).toHaveLength(0);
  });
});

describe("Failure classification (product owner rule: 4xx except 408/429 not retryable, else transient)", () => {
  it.each([400, 401, 403, 404, 422])("HTTP %d is not retryable", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    expect(await providerWith(fetchFn).submit(INSTRUCTION)).toEqual({
      kind: "failed_not_retryable",
      reason: `the image provider answered HTTP ${status}`,
    });
  });

  it.each([408, 429])("HTTP %d is transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    expect(await providerWith(fetchFn).submit(INSTRUCTION)).toEqual({
      kind: "failed_transient",
      reason: `the image provider answered HTTP ${status}`,
    });
  });

  it.each([500, 502, 503])("HTTP %d is transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    expect(await providerWith(fetchFn).submit(INSTRUCTION)).toEqual({
      kind: "failed_transient",
      reason: `the image provider answered HTTP ${status}`,
    });
  });

  it("a network error is transient", async () => {
    const fetchFn = (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;
    const result = await providerWith(fetchFn).submit(INSTRUCTION);
    expect(result).toEqual({ kind: "failed_transient", reason: "the image provider could not be reached" });
  });

  it("an unexpected response shape is transient", async () => {
    const { fetchFn } = fakeFetch(() => new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    const result = await providerWith(fetchFn).submit(INSTRUCTION);
    expect(result.kind).toBe("failed_transient");
  });
});

// group 3, task 3.2 — the stub every later group's tests configure instead
// of the real adapter. "Under-size image", "portrait image" and "download
// failure" are not separate modes: they are exercised by configuring what
// bytes/URL success-bytes/success-temporary-url returns, and how the
// orchestrator's own download step behaves.
describe("The stub adapter (group 3, task 3.2)", () => {
  /** Submits once and checks the request once, the way the orchestrator's first status check does. */
  async function settle(stub: ReturnType<typeof createStubImageProvider>) {
    const submitted = await stub.submit(INSTRUCTION);
    if (submitted.kind !== "submitted") throw new Error("the stub refused the submission");
    return stub.poll(submitted.handle);
  }

  it("success-bytes returns the configured bytes and content type", async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const result = await settle(createStubImageProvider("success-bytes", { bytes, contentType: "image/jpeg" }));
    expect(result).toEqual({ kind: "success", image: { source: "bytes", bytes, contentType: "image/jpeg" } });
  });

  it("success-temporary-url returns the configured URL", async () => {
    const result = await settle(createStubImageProvider("success-temporary-url", { url: "https://example.test/x.jpg" }));
    expect(result).toEqual({ kind: "success", image: { source: "temporary-url", url: "https://example.test/x.jpg" } });
  });

  it("success-temporary-url falls back to a default URL when none is configured", async () => {
    const result = await settle(createStubImageProvider("success-temporary-url"));
    expect(result).toEqual({ kind: "success", image: { source: "temporary-url", url: "https://fal.media/files/stub.jpg" } });
  });

  it("transient-failure and not-retryable-failure return their classified outcome", async () => {
    expect((await settle(createStubImageProvider("transient-failure"))).kind).toBe("failed_transient");
    expect((await settle(createStubImageProvider("not-retryable-failure"))).kind).toBe("failed_not_retryable");
  });

  it("records every instruction it was submitted with", async () => {
    const stub = createStubImageProvider("success-bytes");
    await stub.submit("first");
    await stub.submit("second");
    expect(stub.calls).toEqual(["first", "second"]);
  });

  it("answers the scripted status checks in order, then the configured mode, and records the checks and cancels", async () => {
    const stub = createStubImageProvider("transient-failure", { script: [{ kind: "queued" }, { kind: "in-progress" }] });
    const submitted = await stub.submit(INSTRUCTION);
    if (submitted.kind !== "submitted") throw new Error("the stub refused the submission");

    expect((await stub.poll(submitted.handle)).kind).toBe("queued");
    expect((await stub.poll(submitted.handle)).kind).toBe("in-progress");
    expect((await stub.poll(submitted.handle)).kind).toBe("failed_transient");
    expect(await stub.cancel(submitted.handle)).toBe("cancelled");
    expect(stub.polls).toHaveLength(3);
    expect(stub.cancels).toEqual([submitted.handle]);
  });

  it("refuses the submission with the configured failure", async () => {
    const stub = createStubImageProvider("success-bytes", { submitFailure: { kind: "failed_transient", reason: "stub: 429", retryAfterSeconds: 30 } });
    expect(await stub.submit(INSTRUCTION)).toEqual({ kind: "failed_transient", reason: "stub: 429", retryAfterSeconds: 30 });
  });
});

// §12.2 — resolving a temporary-link result to bytes before the image stage
// can succeed (design Decision 6). Exercised end-to-end in
// `test/image-stage.test.ts`; these are the direct unit tests.
function resettingBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({ start: (controller) => controller.error(new Error("read ECONNRESET")) });
}

describe("downloadGeneratedImage (§12.2)", () => {
  afterEach(() => {
    resetDownloadFetch();
  });

  it("downloads the bytes and content type on success", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    setDownloadFetch((async () => new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } })));

    const result = await downloadGeneratedImage("https://fal.media/files/example.jpg");

    expect(result).toEqual({ ok: true, bytes: Buffer.from(bytes), contentType: "image/jpeg" });
  });

  it("fails when the response is not ok", async () => {
    setDownloadFetch((async () => new Response("", { status: 404 })));

    const result = await downloadGeneratedImage("https://fal.media/files/missing.jpg");

    expect(result).toEqual({ ok: false, reason: "downloading the generated image answered HTTP 404" });
  });

  it("fails when the download itself throws (a network error, not an HTTP error)", async () => {
    setDownloadFetch((async () => {
      throw new Error("network unreachable");
    }));

    const result = await downloadGeneratedImage("https://fal.media/files/example.jpg");

    expect(result).toEqual({ ok: false, reason: "the generated image could not be downloaded" });
  });

  // A connection reset while the body streams (ECONNRESET) must be a failed download, never an unhandled rejection
  // that ends the backend process.
  it("fails when the connection resets while the body is being read", async () => {
    setDownloadFetch((async () => new Response(resettingBody(), { status: 200 })));

    const result = await downloadGeneratedImage("https://fal.media/files/example.jpg");

    expect(result).toEqual({ ok: false, reason: "the generated image could not be downloaded" });
  });
});

// use-reference-image-in-generation (JOS-202), design Decisions 2 and 5 — the request with a session's reference image.
describe("The request with a reference image (JOS-202)", () => {
  const REFERENCE = { bytes: Buffer.from("not-really-a-webp"), contentType: "image/webp", sha256: "a".repeat(64) };

  it("posts to the reference model with the reference as a data URI and the recorded request size", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse);

    await providerWith(fetchFn).submit(INSTRUCTION, REFERENCE);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://queue.fal.run/bytedance/seedream/v5/pro/edit");
    expect(IMAGE_REFERENCE_MODEL).toBe("bytedance/seedream/v5/pro/edit");
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      prompt: INSTRUCTION,
      image_urls: [`data:image/webp;base64,${REFERENCE.bytes.toString("base64")}`],
      image_size: { width: 1920, height: 1088 },
      output_format: "png",
    });
  });

  it("sends the same request as before when there is no reference", async () => {
    const { fetchFn, calls } = fakeFetch(successResponse);

    await providerWith(fetchFn).submit(INSTRUCTION, undefined);

    expect(calls[0]?.url).toBe("https://queue.fal.run/fal-ai/flux/dev");
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ prompt: INSTRUCTION, image_size: { width: 1920, height: 1088 } });
  });

  it.each([400, 413, 415, 422])("HTTP %d on a request with a reference is not retryable and names the reference image", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("raw provider detail", { status }));
    const result = await providerWith(fetchFn).submit(INSTRUCTION, REFERENCE);
    expect(result).toEqual({ kind: "failed_not_retryable", reason: `the image provider rejected the reference image (HTTP ${status})` });
  });

  it.each([401, 403])("HTTP %d on a request with a reference keeps the existing wording", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    const result = await providerWith(fetchFn).submit(INSTRUCTION, REFERENCE);
    expect(result).toEqual({ kind: "failed_not_retryable", reason: `the image provider answered HTTP ${status}` });
  });

  it.each([408, 429, 500, 503])("HTTP %d on a request with a reference stays transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("", { status }));
    const result = await providerWith(fetchFn).submit(INSTRUCTION, REFERENCE);
    expect(result.kind).toBe("failed_transient");
  });

  it("never copies the reference bytes into a failure reason", async () => {
    const { fetchFn } = fakeFetch(() => new Response("", { status: 422 }));
    const result = await providerWith(fetchFn).submit(INSTRUCTION, REFERENCE);
    expect(JSON.stringify(result)).not.toContain(REFERENCE.bytes.toString("base64"));
  });
});
