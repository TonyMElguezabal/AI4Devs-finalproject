import { describe, expect, it } from "vitest";
import { createOpenAiVisualInstructionGenerator } from "../src/visualInstructions.ts";

// assign-scene-identifiers (JOS-144) task 3.6 — opt-in contract test against
// the REAL reasoning provider. It costs money and needs OPENAI_KEY, so it is
// skipped unless explicitly enabled:
//
//   RUN_PROVIDER_CONTRACT_TESTS=1 npx vitest run test/visual-instructions.contract.test.ts

const enabled = process.env.RUN_PROVIDER_CONTRACT_TESTS === "1";

describe.skipIf(!enabled)("The real reasoning provider returns one instruction pair per fragment", () => {
  it(
    "answers a two-fragment English request with two non-empty pairs",
    async () => {
      const result = await createOpenAiVisualInstructionGenerator().generate(
        ["The harbor is quiet at dusk.", "Fishing boats return with the evening tide."],
        "en",
      );

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.pairs).toHaveLength(2);
        for (const pair of result.pairs) {
          expect(pair.image.length).toBeGreaterThan(0);
          expect(pair.video.length).toBeGreaterThan(0);
        }
      }
    },
    30_000,
  );
});
