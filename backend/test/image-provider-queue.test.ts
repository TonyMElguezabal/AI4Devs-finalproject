import { describe, expect, it } from "vitest";
import { createFalAiImageProvider, type ImageHandle } from "../src/imageProvider.ts";
import { IMAGE_QUEUE_START_WINDOW_SECONDS, IMAGE_REFERENCE_MODEL } from "../src/config/providers.ts";

// follow-fal-image-queue (JOS-239), group 2 — the Fal.ai adapter on the queue API: one submission per attempt,
// then status / result / cancel through the addresses the submission returned. The response shapes are the ones
// recorded in reports/2026-10-30-step-1-fal-queue-shapes.md.

const QUEUE = "https://queue.fal.run";
const INSTRUCTION = "A lighthouse at dusk, waves breaking against the rocks";
const REFERENCE = { bytes: Buffer.from("reference-bytes"), contentType: "image/png", sha256: "abc" };

const HANDLE: ImageHandle = {
  requestId: "req-1",
  statusUrl: `${QUEUE}/fal-ai/flux/requests/req-1/status`,
  responseUrl: `${QUEUE}/fal-ai/flux/requests/req-1`,
  cancelUrl: `${QUEUE}/fal-ai/flux/requests/req-1/cancel`,
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const submissionBody = (overrides: Record<string, unknown> = {}) => ({
  status: "IN_QUEUE",
  request_id: HANDLE.requestId,
  response_url: HANDLE.responseUrl,
  status_url: HANDLE.statusUrl,
  cancel_url: HANDLE.cancelUrl,
  ...overrides,
});

type RecordedCall = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(answer: (call: RecordedCall) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
  return { fetchFn, calls };
}

const providerWith = (fetchFn: typeof fetch, loadKey: () => string = () => "test-key") =>
  createFalAiImageProvider({ fetchFn, loadKey, parameters: { model: "fal-ai/flux/dev" } });

describe("submit", () => {
  it("sends one POST to the queue with the start window, the credential and the recorded request size", async () => {
    const { fetchFn, calls } = fakeFetch(() => json(submissionBody()));
    const result = await providerWith(fetchFn).submit(INSTRUCTION);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${QUEUE}/fal-ai/flux/dev`);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.Authorization).toBe("Key test-key");
    expect(calls[0]!.headers["X-Fal-Request-Start-Timeout"]).toBe(String(IMAGE_QUEUE_START_WINDOW_SECONDS));
    expect(IMAGE_QUEUE_START_WINDOW_SECONDS).toBe(1800);
    expect(calls[0]!.body).toEqual({ prompt: INSTRUCTION, image_size: { width: 1920, height: 1088 } });
    expect(result).toEqual({ kind: "submitted", handle: HANDLE });
  });

  it("sends a request with a reference image to the reference model, with the reference as a data URI", async () => {
    const { fetchFn, calls } = fakeFetch(() => json(submissionBody()));
    await providerWith(fetchFn).submit(INSTRUCTION, REFERENCE);

    expect(calls[0]!.url).toBe(`${QUEUE}/${IMAGE_REFERENCE_MODEL}`);
    expect((calls[0]!.body as { image_urls: string[] }).image_urls).toEqual([
      `data:image/png;base64,${REFERENCE.bytes.toString("base64")}`,
    ]);
  });

  it("fails not-retryable when the credential is missing, and sends no request", async () => {
    const { fetchFn, calls } = fakeFetch(() => json(submissionBody()));
    const result = await providerWith(fetchFn, () => {
      throw new Error("missing API key for the image role");
    }).submit(INSTRUCTION);

    expect(result).toEqual({ kind: "failed_not_retryable", reason: "missing API key for the image role" });
    expect(calls).toHaveLength(0);
  });

  it("is transient on a network error, without echoing the error", async () => {
    const { fetchFn } = fakeFetch(() => {
      throw new Error("ECONNRESET secret-detail");
    });
    const result = await providerWith(fetchFn).submit(INSTRUCTION);

    expect(result).toEqual({ kind: "failed_transient", reason: "the image provider could not be reached" });
  });

  it("classifies HTTP errors by the product owner rule (4xx except 408/429 not retryable, else transient)", async () => {
    for (const [status, kind] of [
      [401, "failed_not_retryable"],
      [408, "failed_transient"],
      [429, "failed_transient"],
      [500, "failed_transient"],
    ] as const) {
      const { fetchFn } = fakeFetch(() => json({ detail: "x" }, status));
      const result = await providerWith(fetchFn).submit(INSTRUCTION);
      expect(result).toMatchObject({ kind, reason: `the image provider answered HTTP ${status}` });
    }
  });

  it("carries Retry-After from an HTTP 429 as retryAfterSeconds", async () => {
    const { fetchFn } = fakeFetch(() => json({}, 429, { "Retry-After": "30" }));
    const result = await providerWith(fetchFn).submit(INSTRUCTION);

    expect(result).toEqual({ kind: "failed_transient", reason: "the image provider answered HTTP 429", retryAfterSeconds: 30 });
  });

  it("fails not-retryable when the provider rejects the reference image", async () => {
    const { fetchFn } = fakeFetch(() => json({ detail: "x" }, 422));
    const result = await providerWith(fetchFn).submit(INSTRUCTION, REFERENCE);

    expect(result).toEqual({ kind: "failed_not_retryable", reason: "the image provider rejected the reference image (HTTP 422)" });
  });

  it("refuses a returned address outside the queue origin, without echoing it", async () => {
    const { fetchFn, calls } = fakeFetch(() => json(submissionBody({ status_url: "https://evil.example/steal" })));
    const result = await providerWith(fetchFn).submit(INSTRUCTION);

    expect(result.kind).toBe("failed_transient");
    expect(JSON.stringify(result)).not.toContain("evil.example");
    expect(calls).toHaveLength(1);
  });

  it("is transient when the response has no request address", async () => {
    const { fetchFn } = fakeFetch(() => json({ status: "IN_QUEUE" }));
    const result = await providerWith(fetchFn).submit(INSTRUCTION);

    expect(result).toEqual({ kind: "failed_transient", reason: "the image provider's response did not match the expected shape" });
  });
});

describe("poll", () => {
  const poll = (answer: (call: RecordedCall) => Response | Promise<Response>) => {
    const { fetchFn, calls } = fakeFetch(answer);
    return { calls, result: providerWith(fetchFn).poll(HANDLE) };
  };

  it("reports a request that waits in the provider's queue", async () => {
    const { result, calls } = poll(() => json({ status: "IN_QUEUE", queue_position: 3 }));

    expect(await result).toEqual({ kind: "queued" });
    expect(calls[0]).toMatchObject({ url: HANDLE.statusUrl, method: "GET" });
    expect(calls[0]!.headers.Authorization).toBe("Key test-key");
  });

  it("reports a running request, whose status the provider answers with HTTP 202", async () => {
    const { result } = poll(() => json({ status: "IN_PROGRESS" }, 202));

    expect(await result).toEqual({ kind: "in-progress" });
  });

  it("fetches the result of a completed request and returns its image as a temporary URL", async () => {
    const { result, calls } = poll((call) =>
      call.url === HANDLE.statusUrl ? json({ status: "COMPLETED" }) : json({ images: [{ url: "https://fal.media/files/abc/image.jpeg" }] }),
    );

    expect(await result).toEqual({ kind: "success", image: { source: "temporary-url", url: "https://fal.media/files/abc/image.jpeg" } });
    expect(calls.map((c) => c.url)).toEqual([HANDLE.statusUrl, HANDLE.responseUrl]);
  });

  it("is transient when a completed request carries an error, without echoing it", async () => {
    const { result } = poll(() => json({ status: "COMPLETED", error: "secret provider detail", error_type: "anything" }));

    const outcome = await result;
    expect(outcome).toEqual({ kind: "failed_transient", reason: "the image provider ended the request with an error" });
  });

  it("is transient when the result does not match the expected shape", async () => {
    const { result } = poll((call) => (call.url === HANDLE.statusUrl ? json({ status: "COMPLETED" }) : json({ nothing: true })));

    expect(await result).toEqual({ kind: "failed_transient", reason: "the image provider's response did not match the expected shape" });
  });

  it("treats a status check that cannot reach the provider as a failed check, not a failed attempt", async () => {
    const { result } = poll(() => {
      throw new Error("ECONNRESET");
    });

    expect(await result).toEqual({ kind: "check-failed" });
  });

  it("treats an HTTP 5xx on the status check as a failed check", async () => {
    const { result } = poll(() => json({}, 503));

    expect(await result).toEqual({ kind: "check-failed" });
  });

  it("treats a failed result fetch after COMPLETED as a failed check, so the next check retries it", async () => {
    const { result } = poll((call) => (call.url === HANDLE.statusUrl ? json({ status: "COMPLETED" }) : json({}, 502)));

    expect(await result).toEqual({ kind: "check-failed" });
  });

  it("fails the attempt, not retryable, when the status check is refused (HTTP 401), instead of polling forever", async () => {
    const { result } = poll(() => json({}, 401));

    expect(await result).toEqual({ kind: "failed_not_retryable", reason: "the image provider answered HTTP 401 to a status check" });
  });

  it("fails the attempt when the provider no longer knows the request (HTTP 404)", async () => {
    const { result } = poll(() => json({}, 404));

    expect(await result).toEqual({ kind: "failed_transient", reason: "the image provider no longer holds the request" });
  });
});

describe("cancel", () => {
  const cancel = async (answer: () => Response) => {
    const { fetchFn, calls } = fakeFetch(answer);
    return { result: await providerWith(fetchFn).cancel(HANDLE), calls };
  };

  it("sends one PUT to the returned cancel address and reports the request cancelled", async () => {
    const { result, calls } = await cancel(() => json({ status: "OK" }));

    expect(result).toBe("cancelled");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: HANDLE.cancelUrl, method: "PUT" });
  });

  it("reports a running request as cancelled once the provider accepted the cancel (HTTP 202)", async () => {
    expect((await cancel(() => json({ status: "CANCELLATION_REQUESTED" }, 202))).result).toBe("cancelled");
  });

  it("reports a request that finished first (HTTP 400 ALREADY_COMPLETED)", async () => {
    expect((await cancel(() => json({ status: "ALREADY_COMPLETED" }, 400))).result).toBe("already-completed");
  });

  it("reports an unknown request, and a cancel that could not be sent, as unknown", async () => {
    expect((await cancel(() => json({}, 404))).result).toBe("unknown");
    const { fetchFn } = fakeFetch(() => {
      throw new Error("ECONNRESET");
    });
    expect(await providerWith(fetchFn).cancel(HANDLE)).toBe("unknown");
  });
});
