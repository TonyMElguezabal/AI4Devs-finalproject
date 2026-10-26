import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// package-executables-build (JOS-205) Decision 3 — nothing downloaded is trusted until it matches a committed SHA-256.
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyChecksum(path: string, expectedSha256: string): void {
  const actual = sha256File(path);
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(`checksum mismatch for ${basename(path)}: expected ${expectedSha256}, got ${actual}`);
  }
}
