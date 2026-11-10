import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRun, getStageAttempts, getVoiceOver, resetAll } from "../src/db.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// detect-blocked-media-tools (JOS-271), group 1 — a media tool that cannot start while the returned audio is measured is
// not "invalid audio", and is not retried as if the provider had failed (each retry is a paid request).

vi.mock("../src/decompositionPhase.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/decompositionPhase.ts")>()),
  launchDecompositionFor: () => undefined,
}));

// A real executable that kills itself, which is what the operating system does to a quarantined binary. Hoisted so
// it exists before the module mock below is evaluated.
const { folder, killedFfprobe } = await vi.hoisted(async () => {
  const { chmodSync, mkdtempSync, writeFileSync } = await import("node:fs");
  const os = await import("node:os");
  const nodePath = await import("node:path");
  const dir = mkdtempSync(nodePath.join(os.tmpdir(), "vid4you-blocked-probe-"));
  const path = nodePath.join(dir, "ffprobe");
  writeFileSync(path, "#!/bin/sh\nkill -9 $$\n");
  chmodSync(path, 0o755);
  return { folder: dir, killedFfprobe: path };
});

vi.mock("../src/config/ffmpeg.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config/ffmpeg.ts")>()),
  FFPROBE: killedFfprobe,
}));

afterAll(() => rmSync(folder, { recursive: true, force: true }));

beforeEach(() => resetAll());

describe.skipIf(process.platform === "win32")("A blocked ffprobe while the audio is measured", () => {
  it("fails the attempt as a tool problem, schedules no retry and stores nothing", async () => {
    const runId = randomUUID();
    createRun(runId, "Blocked probe", "The sun rose slowly over the quiet hills.", "en");
    setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoiceProvider("success") } });

    const outcome = await generateVoiceOver(runId);

    expect(outcome).toMatchObject({ ok: false, reason: "failed" });
    const attempts = getStageAttempts(runId, "voice-over");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ outcome: "not-retryable", errorCode: "probe-unavailable" });
    expect(attempts[0]?.errorMessage).toContain("ffprobe");
    expect(attempts[0]?.errorMessage).not.toContain(folder);
    expect(getVoiceOver(runId)).toBeUndefined();
  });
});
