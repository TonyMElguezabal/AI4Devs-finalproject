import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkClip } from "../src/clipOutputCheck.ts";
import { FFMPEG } from "../src/config/ffmpeg.ts";
import { createStubVideoProvider, stubClipMaker } from "../src/videoProvider.ts";

// check-generated-clip (JOS-265), design Decision 4 — a stubbed run passes the real clip check, so the stub returns a real
// clip at the duration it was asked for.

const folder = mkdtempSync(join(tmpdir(), "vid4you-stub-clip-test-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("the stub video provider's clips", () => {
  it("returns, for a 7 s request, a clip that passes the clip check at 7 s", async () => {
    const stub = createStubVideoProvider("success-bytes", { clipFor: stubClipMaker(FFMPEG, folder) });
    const submitted = await stub.submit({ imageBytes: Buffer.alloc(0), instruction: "x", durationSeconds: 7 });
    if (submitted.kind !== "submitted") throw new Error("not submitted");

    const polled = await stub.poll(submitted.requestId);

    if (polled.kind !== "success" || polled.clip.source !== "bytes") throw new Error("not a clip");
    expect(await checkClip(polled.clip.bytes, 7)).toEqual({ ok: true });
    expect(await checkClip(polled.clip.bytes, 12)).toMatchObject({ ok: false }); // it is really 7 s long
  });

  it("makes each duration once and reuses it", () => {
    const makeClip = stubClipMaker(FFMPEG, folder);
    expect(makeClip(5)).toBe(makeClip(5));
  });
});
