import { describe, expect, it } from "vitest";
import { loadCredential } from "../src/config/credentials.ts";
import { createFalAiImageProvider } from "../src/imageProvider.ts";

// follow-fal-image-queue (JOS-239) — the real fal.ai queue API through the adapter: one submission, status checks until
// it completes, and its result. It generates one billed image (`fal-ai/flux/dev`), so it runs only with
// RUN_PROVIDER_CONTRACT_TESTS=1 and a FAL_API_KEY; the other provider contract tests spend nothing and only need a key.

const enabled = (() => {
  if (process.env.RUN_PROVIDER_CONTRACT_TESTS !== "1") return false;
  try {
    loadCredential("FAL_API_KEY");
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!enabled)("fal.ai queue contract (real API, one billed image)", () => {
  it("submits once, follows the same request to completion and returns the image's temporary URL", async () => {
    const provider = createFalAiImageProvider({ parameters: { model: "fal-ai/flux/dev" }, loadKey: () => loadCredential("FAL_API_KEY") });

    const submitted = await provider.submit("a plain blue square on a white table");
    expect(submitted.kind).toBe("submitted");
    if (submitted.kind !== "submitted") return;
    expect(submitted.handle.statusUrl).toMatch(/^https:\/\/queue\.fal\.run\//);

    const seen = new Set<string>();
    for (let check = 0; check < 60; check++) {
      const result = await provider.poll(submitted.handle);
      seen.add(result.kind);
      if (result.kind === "success") {
        expect(result.image.source).toBe("temporary-url");
        expect(seen.has("check-failed")).toBe(false);
        // A finished request answers a late cancel with "already completed".
        expect(await provider.cancel(submitted.handle)).toBe("already-completed");
        return;
      }
      expect(["queued", "in-progress"]).toContain(result.kind);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("the request did not complete within two minutes");
  }, 150_000);
});
