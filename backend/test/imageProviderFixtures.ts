import type { ImageGenerationResult, ImageHandle, ImagePollResult, ImageProvider, ReferenceImage } from "../src/imageProvider.ts";

// follow-fal-image-queue (JOS-239) — the image port is submit / poll / cancel. Most tests only care what an image
// attempt ends with, so this wraps an old-style `generate` function: it is called at submission, and the next poll
// reports `in-progress` until it has settled, then its result. A function that never settles is a request that is
// still running.
export function imageProviderFromGenerate(
  generate: (instruction: string, referenceImage?: ReferenceImage) => Promise<ImageGenerationResult> | ImageGenerationResult,
): ImageProvider {
  const settled = new Map<string, ImageGenerationResult>();
  let submissions = 0;
  return {
     
    async submit(instruction, referenceImage) {
      submissions += 1;
      const requestId = `fixture-request-${submissions}`;
      const handle: ImageHandle = {
        requestId,
        statusUrl: `https://queue.fal.run/fixture/requests/${requestId}/status`,
        responseUrl: `https://queue.fal.run/fixture/requests/${requestId}`,
        cancelUrl: `https://queue.fal.run/fixture/requests/${requestId}/cancel`,
      };
      // Called synchronously, as the old port was: a test can observe the scene at the moment the request is sent.
      let pending: Promise<ImageGenerationResult>;
      try {
        pending = Promise.resolve(generate(instruction, referenceImage));
      } catch (err) {
        pending = Promise.reject(err instanceof Error ? err : new Error("threw"));
      }
      void pending.then(
          (result) => settled.set(requestId, result),
          (err: unknown) =>
            settled.set(requestId, {
              kind: "failed_transient",
              reason: err instanceof Error ? `the image provider threw: ${err.message}` : "the image provider threw an unexpected error",
            }),
        );
      return { kind: "submitted", handle };
    },
     
    async poll(handle): Promise<ImagePollResult> {
      return settled.get(handle.requestId) ?? { kind: "in-progress" };
    },
     
    async cancel() {
      return "cancelled";
    },
  };
}

/** An image provider whose requests never finish. */
export const heldImageProvider = (): ImageProvider => imageProviderFromGenerate(() => new Promise(() => {}));

/** The old image port, kept as the shape tests write by hand: one call that resolves with the outcome. */
export interface LegacyImageAdapter {
  generate(instruction: string, referenceImage?: ReferenceImage): Promise<ImageGenerationResult>;
}

/** Accepts either port, so a test can pass a hand-written `{ generate }` object or a real provider. */
export function toImageProvider(adapter: ImageProvider | LegacyImageAdapter): ImageProvider {
  return "generate" in adapter ? imageProviderFromGenerate((instruction, referenceImage) => adapter.generate(instruction, referenceImage)) : adapter;
}
