import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElevenLabsAlignmentProvider } from "../src/alignmentProvider.ts";
import { checkTimestamps } from "../src/narrationTimestamps.ts";

// obtain-narration-timestamps (JOS-139) task 3.6 — opt-in contract test against
// the REAL forced-alignment endpoint. It needs an MP3 and the script it
// narrates, and it uses the ElevenLabs quota, so it is skipped unless enabled:
//
//   RUN_PROVIDER_CONTRACT_TESTS=1 ALIGNMENT_CONTRACT_MP3=<path> ALIGNMENT_CONTRACT_SCRIPT=<text> \
//     ALIGNMENT_CONTRACT_DURATION=<seconds> npx vitest run test/alignment-provider.contract.test.ts

const enabled =
  process.env.RUN_PROVIDER_CONTRACT_TESTS === "1" &&
  Boolean(process.env.ALIGNMENT_CONTRACT_MP3) &&
  Boolean(process.env.ALIGNMENT_CONTRACT_SCRIPT);

describe.skipIf(!enabled)("The real forced-alignment endpoint aligns a narration against its script", () => {
  it(
    "returns characters that pass the usability check for the same script",
    async () => {
      const audio = readFileSync(process.env.ALIGNMENT_CONTRACT_MP3!);
      const script = process.env.ALIGNMENT_CONTRACT_SCRIPT!;
      const duration = Number(process.env.ALIGNMENT_CONTRACT_DURATION ?? "0");

      const started = Date.now();
      const result = await createElevenLabsAlignmentProvider().align(audio, script);
      console.log(`forced alignment answered in ${Date.now() - started} ms`);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(checkTimestamps(result.characters, script, duration, "ignore-whitespace")).toEqual({ usable: true });
      }
    },
    30_000,
  );
});
