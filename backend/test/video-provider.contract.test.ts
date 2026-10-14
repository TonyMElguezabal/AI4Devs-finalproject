import { describe, expect, it } from "vitest";
import { loadCredential } from "../src/config/credentials.ts";
import { createRunningHubVideoProvider } from "../src/videoProvider.ts";

// fix-runninghub-adapter (JOS-196) — the real RunningHub API, no spend: skipped without RUNNINGHUB_API_KEY, like the
// other provider contract tests. Generating a clip is billable and is checked by hand (step 5 report), not here.

const hasKey = (() => {
  try {
    loadCredential("RUNNINGHUB_API_KEY");
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasKey)("RunningHub contract (real API, no spend)", () => {
  it("answers a poll of a malformed task id with a transient failure that carries the provider's error code", async () => {
    const result = await createRunningHubVideoProvider().poll("0");

    expect(result.kind).toBe("failed_transient");
    if (result.kind === "failed_transient") expect(result.reason).toMatch(/\(error \d+\)/);
  });
});
