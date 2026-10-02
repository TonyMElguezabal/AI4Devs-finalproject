// Minimal ULID (https://github.com/ulid/spec) generator — no dependency,
// consistent with this project's preference for zero native/third-party
// dependencies where the standard library suffices (cf. `node:sqlite` over
// `better-sqlite3`, `docs/adr/0002-persistence.md`).
//
// start-video-project (JOS-134) Decision 3 — the session identifier must be
// "opaque, creation-ordered": not derived from the title (opaque), and
// sorting lexicographically by creation time (ULID's 48-bit millisecond
// timestamp prefix, Crockford base32-encoded, guarantees this) — unlike a
// random UUIDv4, which is opaque but not creation-ordered.
import { randomBytes } from "node:crypto";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(ms: number, length: number): string {
  let str = "";
  let value = ms;
  for (let i = length - 1; i >= 0; i--) {
    str = CROCKFORD_ALPHABET[value % 32] + str;
    value = Math.floor(value / 32);
  }
  return str;
}

function encodeRandom(length: number): string {
  const bytes = randomBytes(length);
  let str = "";
  for (let i = 0; i < length; i++) {
    str += CROCKFORD_ALPHABET[(bytes[i] ?? 0) % 32];
  }
  return str;
}

/** 26-character ULID: 10 chars of millisecond timestamp + 16 chars of randomness. */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now, 10) + encodeRandom(16);
}
