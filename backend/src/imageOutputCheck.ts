// generate-chunk-image (JOS-145), design Decision 1 — PRD §7.1: an image is
// accepted only if it is at least 1920x1080 and horizontal, with an aspect
// ratio within +/-1% of 16:9. The recorded provider setting is 1920x1088
// (Fal.ai rounds to multiples of 16), which is 0.74% off 16:9, so an exact
// 16:9 check would reject every real image. Dimensions are always measured
// from the stored file's own header, never trusted from provider metadata.

const TARGET_ASPECT_RATIO = 16 / 9;
const ASPECT_RATIO_TOLERANCE = 0.01;

export function isAcceptedImageSize(width: number, height: number): boolean {
  if (width < 1920 || height < 1080) return false;
  const ratio = width / height;
  return Math.abs(ratio - TARGET_ASPECT_RATIO) / TARGET_ASPECT_RATIO <= ASPECT_RATIO_TOLERANCE;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** JPEG start-of-frame markers that carry dimensions (excludes DHT 0xC4, JPG 0xC8, DAC 0xCC). */
function isStartOfFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** Markers with no length-prefixed payload to skip (standalone markers). */
function isStandaloneMarker(marker: number): boolean {
  return marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2; // past the SOI marker (0xFFD8), already confirmed by the caller
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null; // not a marker where one was expected
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === undefined) return null;
    if (marker === 0xd9) return null; // EOI reached with no SOF segment found
    if (isStandaloneMarker(marker)) continue;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset); // includes these 2 length bytes
    if (isStartOfFrameMarker(marker)) {
      if (offset + 5 > bytes.length) return null;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return { width, height };
    }
    offset += segmentLength;
  }
  return null;
}

/** Measures dimensions from a stored image's own header (PNG or JPEG), never from provider-reported metadata. */
export function readImageDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return readJpegDimensions(bytes);
  }
  return null;
}

/** A filename extension for a stored image, sniffed from its own bytes (same signatures as `readImageDimensions`). */
export function sniffImageExtension(bytes: Buffer): "png" | "jpg" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return null;
}
