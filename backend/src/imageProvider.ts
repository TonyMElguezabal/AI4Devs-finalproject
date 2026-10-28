import { z } from "zod";
import { keyFor, stageApiKey } from "./keyStore.ts";
import { buildProfileRegistry, profileRegistrySlot } from "./profileRegistry.ts";
import { IMAGE_GENERATION_SIZE, IMAGE_PROVIDER, IMAGE_REFERENCE_MODEL, phaseTimeoutMs } from "./config/providers.ts";

// generate-chunk-image (JOS-145) — the image stage's provider (PRD §7.1,
// §11.3): Fal.ai `fal-ai/flux/dev`. The adapter makes exactly one request:
// no SDK and no retry loop, since retries belong to the retry policy
// (JOS-184) and a hidden retry would multiply its budget. Design Decision 6
// — this is a single synchronous HTTP call (verified, JOS-165 step 5b): the
// request goes in, the image comes back in the same round trip. There is no
// job id to poll later, unlike RunningHub's video stage.

/** What the adapter returns for a successful generation: bytes it already holds, or a link the caller must download. */
export type GeneratedImage = { source: "bytes"; bytes: Buffer; contentType: string } | { source: "temporary-url"; url: string };

export type ImageGenerationResult =
  | { kind: "success"; image: GeneratedImage }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string };

/** use-reference-image-in-generation (JOS-202) — a session's reference image as the adapter receives it: the bytes read from the session's snapshot and their hash. */
export type ReferenceImage = { bytes: Buffer; contentType: string; sha256: string };

/** The port the image stage depends on; tests pass a stub, production the Fal.ai adapter. */
export interface ImageProvider {
  generate(instruction: string, referenceImage?: ReferenceImage): Promise<ImageGenerationResult>;
}


/** The statuses Fal answers when the reference image itself is unusable (spike report, step 1): undecodable (422), too large or of an unsupported type. */
const REFERENCE_REJECTION_STATUSES = new Set([400, 413, 415, 422]);

/** Product owner rule (as for voice, alignment and reasoning): not retryable for 4xx except 408 and 429; transient otherwise. */
function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string().min(1) })).min(1),
});

export function createFalAiImageProvider(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; timeoutMs?: number; parameters?: { model: string }; referenceModel?: string } = {},
): ImageProvider {
  const fetchFn = options.fetchFn ?? fetch;
  // manage-providers-from-admin (JOS-218): the model comes from the profile; without one, the settings' image model.
  const falRunUrl = `https://fal.run/${(options.parameters ?? { model: IMAGE_PROVIDER.model }).model}`;
  // use-reference-image-in-generation (JOS-202) Decision 2 — a request that carries a reference goes to the reference model.
  const falReferenceRunUrl = `https://fal.run/${options.referenceModel ?? IMAGE_REFERENCE_MODEL}`;
  const loadKey = options.loadKey ?? (() => stageApiKey("image"));
  // stage-execution-time-limit (JOS-185) Decision 9 — the image stage records no attempt row, so its
  // maximum time is applied here, from the moment the call is made (after its request-cap slot was taken).
  const timeoutMs = options.timeoutMs ?? phaseTimeoutMs("image");

  return {
    async generate(instruction, referenceImage) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        // The loader's message names the credential and never contains a value.
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing API key for the image role" };
      }

      let response: Response;
      try {
        response = await fetchFn(referenceImage ? falReferenceRunUrl : falRunUrl, {
          method: "POST",
          headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
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
          signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = timeoutMs !== undefined && err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          kind: "failed_transient",
          reason: timedOut ? "the image provider did not answer within the time limit" : "the image provider could not be reached",
        };
      }

      if (!response.ok) {
        // The body is deliberately not read into the reason: it can carry raw provider detail.
        if (referenceImage && REFERENCE_REJECTION_STATUSES.has(response.status)) {
          return { kind: "failed_not_retryable", reason: `the image provider rejected the reference image (HTTP ${response.status})` };
        }
        return { kind: classifyHttpStatus(response.status), reason: `the image provider answered HTTP ${response.status}` };
      }

      const parsed = falResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        return { kind: "failed_transient", reason: "the image provider's response did not match the expected shape" };
      }

      return { kind: "success", image: { source: "temporary-url", url: parsed.data.images[0]!.url } };
    },
  };
}

/** The modes the stub adapter can be configured for (group 3 / group 4-6 tests). */
export type StubImageProviderMode =
  | "success-bytes"
  | "success-temporary-url"
  | "transient-failure"
  | "not-retryable-failure";

/** A deterministic stand-in for `ImageProvider`, used by every test in this story instead of the real Fal.ai adapter. */
export function createStubImageProvider(
  mode: StubImageProviderMode,
  options: { bytes?: Buffer; contentType?: string; url?: string } = {},
): ImageProvider & { calls: string[]; references: Array<ReferenceImage | undefined> } {
  const calls: string[] = [];
  const references: Array<ReferenceImage | undefined> = [];
  return {
    calls,
    references,
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async image provider contract
    async generate(instruction, referenceImage) {
      calls.push(instruction);
      references.push(referenceImage);
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
