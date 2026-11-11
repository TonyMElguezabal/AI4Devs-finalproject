import { describe, expect, it } from "vitest";
import { checkClip, judgeClip } from "../src/clipOutputCheck.ts";
import { makeClip } from "./clipFixtures.ts";

// check-generated-clip (JOS-265), design Decisions 1-2 — a clip is judged from its own bytes, never from provider metadata.

const good = { formatName: "mov,mp4,m4a,3gp,3g2,mj2", framesRead: 1, width: 2528, height: 1440, durationSeconds: 10.125 };

describe("judgeClip (pure)", () => {
  it("accepts a typical real clip: 2528x1440 lasting 0.667 s more than requested", () => {
    expect(judgeClip({ ...good, durationSeconds: 13.667 }, 13)).toEqual({ ok: true });
  });

  it("accepts 1920x1080 at exactly the requested duration", () => {
    expect(judgeClip({ ...good, width: 1920, height: 1080, durationSeconds: 10 }, 10)).toEqual({ ok: true });
  });

  it("refuses a file ffprobe does not read as an MP4", () => {
    expect(judgeClip({ ...good, formatName: "matroska,webm" }, 10)).toEqual({ ok: false, unavailable: false, reason: "the generated clip is not an MP4 file that can be read" });
  });

  it("refuses a clip whose first frame does not decode", () => {
    expect(judgeClip({ ...good, framesRead: 0 }, 10)).toEqual({ ok: false, unavailable: false, reason: "the generated clip has no video that can be decoded" });
    expect(judgeClip({ ...good, framesRead: undefined, width: undefined, height: undefined }, 10)).toMatchObject({ ok: false, reason: "the generated clip has no video that can be decoded" });
  });

  it("names the measured size when the clip is too small", () => {
    expect(judgeClip({ ...good, width: 1280, height: 720, durationSeconds: 10 }, 10)).toEqual({
      ok: false,
      unavailable: false,
      reason: "the generated clip is 1280x720; a clip must be horizontal and at least 1920x1080",
    });
  });

  it("refuses a portrait clip even when it is large", () => {
    expect(judgeClip({ ...good, width: 1080, height: 1920, durationSeconds: 10 }, 10)).toMatchObject({ ok: false, reason: expect.stringContaining("1080x1920") });
    expect(judgeClip({ ...good, width: 2160, height: 2160, durationSeconds: 10 }, 10)).toMatchObject({ ok: false });
  });

  it("checks the size at its boundaries", () => {
    expect(judgeClip({ ...good, width: 1919, height: 1080, durationSeconds: 10 }, 10)).toMatchObject({ ok: false });
    expect(judgeClip({ ...good, width: 1920, height: 1079, durationSeconds: 10 }, 10)).toMatchObject({ ok: false });
  });

  it("accepts a duration from 0.5 s under to 1 s over the request, and refuses outside it", () => {
    expect(judgeClip(good, 10.625)).toEqual({ ok: true }); // 10.125 = requested - 0.5
    expect(judgeClip(good, 10.626)).toMatchObject({ ok: false });
    expect(judgeClip(good, 9.125)).toEqual({ ok: true }); // 10.125 = requested + 1
    expect(judgeClip(good, 9.124)).toMatchObject({ ok: false });
  });

  it("writes the duration reason for a person", () => {
    expect(judgeClip({ ...good, durationSeconds: 6 }, 10)).toEqual({ ok: false, unavailable: false, reason: "the generated clip lasts 6.0 s, but 10 s was requested" });
  });

  it("reports the first rule that fails, in order", () => {
    expect(judgeClip({ formatName: "matroska", framesRead: 0, width: 640, height: 480, durationSeconds: 1 }, 10)).toMatchObject({ reason: "the generated clip is not an MP4 file that can be read" });
    expect(judgeClip({ ...good, framesRead: 0, width: 640, height: 480, durationSeconds: 1 }, 10)).toMatchObject({ reason: "the generated clip has no video that can be decoded" });
    expect(judgeClip({ ...good, width: 640, height: 480, durationSeconds: 1 }, 10)).toMatchObject({ reason: expect.stringContaining("640x480") });
  });
});

describe("checkClip (real ffprobe on real clips)", () => {
  it("accepts a 1920x1080 clip of the requested length", async () => {
    expect(await checkClip(makeClip(1920, 1080, 10), 10)).toEqual({ ok: true });
  });

  it("refuses a 1280x720 clip", async () => {
    expect(await checkClip(makeClip(1280, 720, 10), 10)).toMatchObject({ ok: false, unavailable: false, reason: expect.stringContaining("1280x720") });
  });

  it("refuses a portrait 1080x1920 clip", async () => {
    expect(await checkClip(makeClip(1080, 1920, 10), 10)).toMatchObject({ ok: false, reason: expect.stringContaining("1080x1920") });
  });

  it("refuses a 6 s clip when 10 s were requested", async () => {
    expect(await checkClip(makeClip(1920, 1080, 6), 10)).toEqual({ ok: false, unavailable: false, reason: "the generated clip lasts 6.0 s, but 10 s was requested" });
  });

  it("refuses a truncated file", async () => {
    const whole = makeClip(1920, 1080, 10);
    expect(await checkClip(whole.subarray(0, 2000), 10)).toMatchObject({ ok: false, unavailable: false });
  });

  it("refuses bytes that are not an MP4", async () => {
    expect(await checkClip(Buffer.from("this is not a video"), 10)).toMatchObject({ ok: false, unavailable: false });
    expect(await checkClip(Buffer.alloc(0), 10)).toMatchObject({ ok: false, unavailable: false });
  });

  it("says the clip could not be checked when ffprobe is not installed", async () => {
    const outcome = await checkClip(makeClip(1920, 1080, 10), 10, "/nonexistent/ffprobe");
    expect(outcome).toMatchObject({ ok: false, unavailable: true, reason: expect.stringContaining("ffprobe") });
    expect(outcome).toMatchObject({ reason: expect.stringContaining("could not be checked") });
  });
});
