import { z } from "zod";
import { keyFor, stageApiKey } from "./keyStore.ts";
import { buildProfileRegistry, profileRegistrySlot } from "./profileRegistry.ts";
import { IMAGE_GENERATION_SIZE, IMAGE_PROVIDER, IMAGE_QUEUE_START_WINDOW_SECONDS, IMAGE_REFERENCE_MODEL } from "./config/providers.ts";

// generate-chunk-image (JOS-145) — the image stage's provider (PRD §7.1, §11.3): Fal.ai `fal-ai/flux/dev`. The adapter
// uses no SDK and no retry loop, since retries belong to the retry policy (JOS-184) and a hidden retry would multiply
// its budget.
//
// follow-fal-image-queue (JOS-239), design Decisions 1-2 — an attempt is one submission to fal.ai's queue API, followed
// through the status / result / cancel addresses the submission returned (the same shape as RunningHub's video stage).
// The synchronous `fal.run` call it replaces was abandoned on our own timeout while fal.ai kept working and billing.

/** What the adapter returns for a successful generation: bytes it already holds, or a link the caller must download. */
export type GeneratedImage = { source: "bytes"; bytes: Buffer; contentType: string } | { source: "temporary-url"; url: string };

/** `retryAfterSeconds` is the provider's own request for a later retry (`Retry-After` on HTTP 429). */
export type ImageFailure =
  | { kind: "failed_transient"; reason: string; retryAfterSeconds?: number }
  | { kind: "failed_not_retryable"; reason: string };

export type ImageGenerationResult = { kind: "success"; image: GeneratedImage } | ImageFailure;

/** use-reference-image-in-generation (JOS-202) — a session's reference image as the adapter receives it: the bytes read from the session's snapshot and their hash. */
export type ReferenceImage = { bytes: Buffer; contentType: string; sha256: string };

/** The addresses fal.ai returned for one request; for a model with a sub-path they carry only `owner/app`, so they are never rebuilt from the model id. */
export type ImageHandle = { requestId: string; statusUrl: string; responseUrl: string; cancelUrl: string };

export type ImageSubmitResult = { kind: "submitted"; handle: ImageHandle } | ImageFailure;

/** `check-failed`: the check itself did not get an answer (network error, HTTP 5xx). It is not a failed attempt; the next check asks again. */
export type ImagePollResult =
  | { kind: "queued" }
  | { kind: "in-progress" }
  | { kind: "check-failed" }
  | { kind: "success"; image: GeneratedImage }
  | ImageFailure;

export type ImageCancelResult = "cancelled" | "already-completed" | "unknown";

/** The port the image stage depends on; tests pass a stub, production the Fal.ai adapter. */
export interface ImageProvider {
  submit(instruction: string, referenceImage?: ReferenceImage): Promise<ImageSubmitResult>;
  poll(handle: ImageHandle): Promise<ImagePollResult>;
  cancel(handle: ImageHandle): Promise<ImageCancelResult>;
}

/** The statuses Fal answers when the reference image itself is unusable (spike report, step 1): undecodable (422), too large or of an unsupported type. */
const REFERENCE_REJECTION_STATUSES = new Set([400, 413, 415, 422]);

/** Product owner rule (as for voice, alignment and reasoning): not retryable for 4xx except 408 and 429; transient otherwise. */
function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

/** The provider's request for a later retry, in seconds; an HTTP date or an unusable value is ignored. */
function retryAfterSeconds(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

const QUEUE_ORIGIN = "https://queue.fal.run";

/** One call to fal.ai (submit, a status check, a result fetch, a cancel) must not hang: the polling loop depends on it returning. */
const CALL_TIMEOUT_MS = 30_000;

const submissionSchema = z.object({
  request_id: z.string().min(1),
  status_url: z.string().min(1),
  response_url: z.string().min(1),
  cancel_url: z.string().min(1),
});

const statusSchema = z.object({ status: z.string(), error: z.unknown().optional() });

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string().min(1) })).min(1),
});

const SHAPE_MISMATCH = "the image provider's response did not match the expected shape";

/** The key is only ever sent to the queue's own origin, whatever address a response carries. */
function isQueueAddress(address: string): boolean {
  try {
    return new URL(address).origin === QUEUE_ORIGIN;
  } catch {
    return false;
  }
}

export function createFalAiImageProvider(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; callTimeoutMs?: number; parameters?: { model: string }; referenceModel?: string } = {},
): ImageProvider {
  const fetchFn = options.fetchFn ?? fetch;
  // manage-providers-from-admin (JOS-218): the model comes from the profile; without one, the settings' image model.
  const queueUrl = `${QUEUE_ORIGIN}/${(options.parameters ?? { model: IMAGE_PROVIDER.model }).model}`;
  // use-reference-image-in-generation (JOS-202) Decision 2 — a request that carries a reference goes to the reference model.
  const queueReferenceUrl = `${QUEUE_ORIGIN}/${options.referenceModel ?? IMAGE_REFERENCE_MODEL}`;
  const loadKey = options.loadKey ?? (() => stageApiKey("image"));
  const callTimeoutMs = options.callTimeoutMs ?? CALL_TIMEOUT_MS;

  const loadKeyOrFailure = (): { key: string } | ImageFailure => {
    try {
      return { key: loadKey() };
    } catch (err) {
      // The loader's message names the credential and never contains a value.
      return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing API key for the image role" };
    }
  };

  const send = (key: string, method: string, url: string, init: { body?: string; headers?: Record<string, string> } = {}): Promise<Response> =>
    fetchFn(url, {
      method,
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", ...init.headers },
      ...(init.body === undefined ? {} : { body: init.body }),
      signal: AbortSignal.timeout(callTimeoutMs),
    });

  return {
    async submit(instruction, referenceImage) {
      const credential = loadKeyOrFailure();
      if (!("key" in credential)) return credential;

      let response: Response;
      try {
        response = await send(credential.key, "POST", referenceImage ? queueReferenceUrl : queueUrl, {
          headers: { "X-Fal-Request-Start-Timeout": String(IMAGE_QUEUE_START_WINDOW_SECONDS) },
          body: JSON.stringify(
            referenceImage
              ? {
                  prompt: instruction,
                  image_urls: [`data:${referenceImage.contentType};base64,${referenceImage.bytes.toString("base64")}`],
                  image_size: IMAGE_GENERATION_SIZE,
                  output_format: "png",
                }
              : { prompt: instruction, image_size: IMAGE_GENERATION_SIZE },
          ),
        });
      } catch {
        return { kind: "failed_transient", reason: "the image provider could not be reached" };
      }

      if (!response.ok) {
        // The body is deliberately not read into the reason: it can carry raw provider detail.
        if (referenceImage && REFERENCE_REJECTION_STATUSES.has(response.status)) {
          return { kind: "failed_not_retryable", reason: `the image provider rejected the reference image (HTTP ${response.status})` };
        }
        const retryAfter = response.status === 429 ? retryAfterSeconds(response) : undefined;
        return {
          kind: classifyHttpStatus(response.status),
          reason: `the image provider answered HTTP ${response.status}`,
          ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
        };
      }

      const parsed = submissionSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) return { kind: "failed_transient", reason: SHAPE_MISMATCH };
      const { request_id: requestId, status_url: statusUrl, response_url: responseUrl, cancel_url: cancelUrl } = parsed.data;
      if (![statusUrl, responseUrl, cancelUrl].every(isQueueAddress)) {
        return { kind: "failed_transient", reason: "the image provider returned an address outside its queue" };
      }
      return { kind: "submitted", handle: { requestId, statusUrl, responseUrl, cancelUrl } };
    },

    async poll(handle) {
      const credential = loadKeyOrFailure();
      if (!("key" in credential)) return credential;

      let status: Response;
      try {
        status = await send(credential.key, "GET", handle.statusUrl);
      } catch {
        return { kind: "check-failed" };
      }
      if (status.status === 404) return { kind: "failed_transient", reason: "the image provider no longer holds the request" };
      // A running request is answered with HTTP 202 (step 1.3 report), so any 2xx is a status.
      if (!status.ok) {
        return classifyHttpStatus(status.status) === "failed_not_retryable"
          ? { kind: "failed_not_retryable", reason: `the image provider answered HTTP ${status.status} to a status check` }
          : { kind: "check-failed" };
      }

      const parsedStatus = statusSchema.safeParse(await status.json().catch(() => null));
      if (!parsedStatus.success) return { kind: "check-failed" };
      if (parsedStatus.data.status === "IN_QUEUE") return { kind: "queued" };
      if (parsedStatus.data.status !== "COMPLETED") return { kind: "in-progress" };
      // The error is not read into the reason: it can carry raw provider detail.
      if (parsedStatus.data.error !== undefined && parsedStatus.data.error !== null) {
        return { kind: "failed_transient", reason: "the image provider ended the request with an error" };
      }

      let result: Response;
      try {
        result = await send(credential.key, "GET", handle.responseUrl);
      } catch {
        return { kind: "check-failed" };
      }
      if (!result.ok) return { kind: "check-failed" };
      const parsed = falResponseSchema.safeParse(await result.json().catch(() => null));
      if (!parsed.success) return { kind: "failed_transient", reason: SHAPE_MISMATCH };
      return { kind: "success", image: { source: "temporary-url", url: parsed.data.images[0]!.url } };
    },

    async cancel(handle) {
      const credential = loadKeyOrFailure();
      if (!("key" in credential)) return "unknown";
      try {
        const response = await send(credential.key, "PUT", handle.cancelUrl);
        if (response.status === 200 || response.status === 202) return "cancelled";
        if (response.status === 400) {
          const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
          if (body?.status === "ALREADY_COMPLETED") return "already-completed";
        }
        return "unknown";
      } catch {
        return "unknown";
      }
    },
  };
}

/** The modes the stub adapter can be configured for (group 3 / group 4-6 tests). */
export type StubImageProviderMode =
  | "success-bytes"
  | "success-temporary-url"
  | "transient-failure"
  | "not-retryable-failure";

/**
 * A deterministic stand-in for `ImageProvider`, used by every test in this story instead of the real Fal.ai adapter.
 * follow-fal-image-queue (JOS-239): `submit` always succeeds with a fresh handle; `poll` answers the next entry of
 * `options.script` (so a test can drive queued → in-progress → success), and once the script is used up answers the
 * configured mode.
 */
export function createStubImageProvider(
  mode: StubImageProviderMode,
  options: { bytes?: Buffer; contentType?: string; url?: string; script?: ImagePollResult[]; submitFailure?: ImageFailure } = {},
): ImageProvider & { calls: string[]; references: Array<ReferenceImage | undefined>; cancels: ImageHandle[]; polls: ImageHandle[] } {
  const calls: string[] = [];
  const references: Array<ReferenceImage | undefined> = [];
  const cancels: ImageHandle[] = [];
  const polls: ImageHandle[] = [];
  const script = [...(options.script ?? [])];
  let submissions = 0;
  const modeResult = (): ImagePollResult => {
    switch (mode) {
      case "success-bytes":
        return {
          kind: "success",
          image: { source: "bytes", bytes: options.bytes ?? Buffer.alloc(0), contentType: options.contentType ?? "image/png" },
        };
      case "success-temporary-url":
        return { kind: "success", image: { source: "temporary-url", url: options.url ?? "https://fal.media/files/stub.jpg" } };
      case "transient-failure":
        return { kind: "failed_transient", reason: "stub: transient image provider error (503)" };
      case "not-retryable-failure":
        return { kind: "failed_not_retryable", reason: "stub: content-filter rejection" };
    }
  };
  return {
    calls,
    references,
    cancels,
    polls,
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async image provider contract
    async submit(instruction, referenceImage) {
      calls.push(instruction);
      references.push(referenceImage);
      if (options.submitFailure) return options.submitFailure;
      submissions += 1;
      const requestId = `stub-request-${submissions}`;
      return {
        kind: "submitted",
        handle: {
          requestId,
          statusUrl: `https://queue.fal.run/stub/requests/${requestId}/status`,
          responseUrl: `https://queue.fal.run/stub/requests/${requestId}`,
          cancelUrl: `https://queue.fal.run/stub/requests/${requestId}/cancel`,
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async image provider contract
    async poll(handle) {
      polls.push(handle);
      return script.shift() ?? modeResult();
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async image provider contract
    async cancel(handle) {
      cancels.push(handle);
      return "cancelled";
    },
  };
}

// design Decision 7 — a small module-level registry, mirroring `provider.ts`'s
// and `concurrency.ts`'s own test-configuration shape: `launchScene`'s image
// stage is reached from many scattered entry points (routes, automatic
// retry, boot reconciliation), so the adapter is resolved here rather than
// threaded as a parameter through every one of them. `defaultIdentifier` is
// what an unbound scene binds to (design Decision 3); `adapters` is every
// identifier this build can resolve to a concrete adapter — a bound
// identifier absent from it is AC4's "no adapter in the running build" case.
export interface ImageProviderRegistry {
  defaultIdentifier: string;
  adapters: Record<string, ImageProvider>;
  labels?: Record<string, string>;
  aliases?: readonly string[];
  retired?: readonly string[];
}

function defaultRegistry(): ImageProviderRegistry {
  // manage-providers-from-admin (JOS-218): one adapter per image profile, with the profile's model and its own key.
  return buildProfileRegistry("image", (profile) =>
    createFalAiImageProvider({ parameters: profile.parameters as { model: string }, loadKey: () => keyFor(profile.id) }),
  );
}

const slot = profileRegistrySlot<ImageProvider, ImageProviderRegistry>(defaultRegistry);

export function getImageProviderRegistry(): ImageProviderRegistry {
  return slot.get();
}

/** Test-only: swap the registry for a stub-backed one. */
export function setImageProviderRegistry(next: ImageProviderRegistry): void {
  slot.set(next);
}

/** Test-only: put the registry built from the provider profiles back. */
export function resetImageProviderRegistry(): void {
  slot.reset();
}

// §12.2 — a temporary link (`GeneratedImage` with `source: "temporary-url"`)
// is resolved to bytes before the image stage can succeed. Kept swappable,
// like the registry above, so tests never make a real network call.
let downloadFetch: typeof fetch = fetch;

export function setDownloadFetch(fetchFn: typeof fetch): void {
  downloadFetch = fetchFn;
}

export function resetDownloadFetch(): void {
  downloadFetch = fetch;
}

export type DownloadResult = { ok: true; bytes: Buffer; contentType: string } | { ok: false; reason: string };

export async function downloadGeneratedImage(url: string): Promise<DownloadResult> {
  let response: Response;
  try {
    response = await downloadFetch(url);
  } catch {
    return { ok: false, reason: "the generated image could not be downloaded" };
  }
  if (!response.ok) {
    return { ok: false, reason: `downloading the generated image answered HTTP ${response.status}` };
  }
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  // The body streams after the headers: a connection reset here throws, and nothing above would catch it.
  try {
    return { ok: true, bytes: Buffer.from(await response.arrayBuffer()), contentType };
  } catch {
    return { ok: false, reason: "the generated image could not be downloaded" };
  }
}
