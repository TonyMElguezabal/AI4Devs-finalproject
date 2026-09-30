import { z } from "zod";
import { loadCredential } from "./config/credentials.ts";
import { IMAGE_GENERATION_SIZE, IMAGE_PROVIDER } from "./config/providers.ts";

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

/** The port the image stage depends on; tests pass a stub, production the Fal.ai adapter. */
export interface ImageProvider {
  generate(instruction: string): Promise<ImageGenerationResult>;
}

const FAL_RUN_URL = `https://fal.run/${IMAGE_PROVIDER.model}`;

/** Product owner rule (as for voice, alignment and reasoning): not retryable for 4xx except 408 and 429; transient otherwise. */
function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string().min(1) })).min(1),
});

export function createFalAiImageProvider(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; timeoutMs?: number } = {},
): ImageProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const loadKey = options.loadKey ?? (() => loadCredential("FAL_API_KEY"));

  return {
    async generate(instruction) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        // The loader's message names the credential and never contains a value.
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing credential 'FAL_API_KEY'" };
      }

      let response: Response;
      try {
        response = await fetchFn(FAL_RUN_URL, {
          method: "POST",
          headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: instruction, image_size: IMAGE_GENERATION_SIZE }),
          signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          kind: "failed_transient",
          reason: timedOut ? "the image provider did not answer within the time limit" : "the image provider could not be reached",
        };
      }

      if (!response.ok) {
        // The body is deliberately not read into the reason: it can carry raw provider detail.
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
): ImageProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async generate(instruction) {
      calls.push(instruction);
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
