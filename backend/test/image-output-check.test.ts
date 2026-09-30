import { describe, expect, it } from "vitest";
import { isAcceptedImageSize, readImageDimensions } from "../src/imageOutputCheck.ts";

// generate-chunk-image (JOS-145), group 2 — design Decision 1 and PRD §7.1:
// an image is accepted only if it is at least 1920x1080 and its aspect ratio
// is within +/-1% of 16:9, measured from the stored file's own header, never
// from the provider's response metadata.

describe("isAcceptedImageSize (design Decision 1)", () => {
  it("accepts the recorded provider size, 1920x1088 (0.74% off 16:9)", () => {
    expect(isAcceptedImageSize(1920, 1088)).toBe(true);
  });

  it("accepts an exact 16:9 minimum, 1920x1080", () => {
    expect(isAcceptedImageSize(1920, 1080)).toBe(true);
  });

  it("accepts a larger exact 16:9 size, 2560x1440", () => {
    expect(isAcceptedImageSize(2560, 1440)).toBe(true);
  });

  it("rejects an under-size image, 1024x576, even though its ratio is exact 16:9", () => {
    expect(isAcceptedImageSize(1024, 576)).toBe(false);
  });

  it("rejects a portrait image, 1080x1920", () => {
    expect(isAcceptedImageSize(1080, 1920)).toBe(false);
  });

  it("rejects 1920x1200 (16:10), large enough but more than 1% off 16:9", () => {
    expect(isAcceptedImageSize(1920, 1200)).toBe(false);
  });
});

/** A minimal PNG whose IHDR chunk declares the given dimensions; not a decodable image. */
function buildTestPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0); // signature
  buf.writeUInt32BE(13, 8); // IHDR chunk data length
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  // bytes 24-28: bit depth, color type, compression, filter, interlace — irrelevant to dimension reading
  return buf;
}

/** A minimal baseline JPEG (SOI + one SOF0 segment + EOI) declaring the given dimensions. */
function buildTestJpeg(width: number, height: number): Buffer {
  const buf = Buffer.alloc(17);
  buf.set([0xff, 0xd8], 0); // SOI
  buf.set([0xff, 0xc0], 2); // SOF0
  buf.writeUInt16BE(11, 4); // segment length, including these 2 length bytes
  buf.writeUInt8(8, 6); // precision
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  buf.writeUInt8(1, 11); // one component
  buf.set([0x01, 0x11, 0x00], 12); // component id, sampling factors, quant table
  buf.set([0xff, 0xd9], 15); // EOI
  return buf;
}

describe("readImageDimensions (measured from the stored file, not provider metadata)", () => {
  it("reads width and height from a PNG's IHDR chunk", () => {
    expect(readImageDimensions(buildTestPng(1920, 1088))).toEqual({ width: 1920, height: 1088 });
  });

  it("reads width and height from a baseline JPEG's SOF0 segment", () => {
    expect(readImageDimensions(buildTestJpeg(1920, 1088))).toEqual({ width: 1920, height: 1088 });
  });

  it("skips non-SOF JPEG segments (e.g. APP0) to find the SOF0 segment", () => {
    const app0 = Buffer.alloc(2 + 2 + 14); // marker + 2-byte length + a 14-byte JFIF payload
    app0.set([0xff, 0xe0], 0);
    app0.writeUInt16BE(16, 2); // length includes itself: 2 + 14
    const sof0Onward = buildTestJpeg(640, 360).subarray(2); // drop the standalone SOI, keep SOF0..EOI
    const full = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0Onward]);
    expect(readImageDimensions(full)).toEqual({ width: 640, height: 360 });
  });

  it("returns null for a file that is neither a PNG nor a JPEG", () => {
    expect(readImageDimensions(Buffer.from("not an image"))).toBeNull();
  });
});
