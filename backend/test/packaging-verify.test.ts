import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyChecksum } from "../packaging/verify.ts";

// package-executables-build (JOS-205), task 1.1 — a downloaded binary is trusted only after its SHA-256 matches the committed value.
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vid4you-verify-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("verifyChecksum", () => {
  it("passes for a file that matches", () => {
    const file = join(dir, "node.tar.gz");
    writeFileSync(file, "payload");
    expect(() => verifyChecksum(file, createHash("sha256").update("payload").digest("hex"))).not.toThrow();
  });

  it("throws a message naming the file, the expected hash and the actual hash on a mismatch", () => {
    const file = join(dir, "ffmpeg-darwin-arm64.gz");
    writeFileSync(file, "payload");
    const actual = createHash("sha256").update("payload").digest("hex");
    const expected = "0".repeat(64);
    expect(() => verifyChecksum(file, expected)).toThrow(
      new RegExp(`ffmpeg-darwin-arm64\\.gz.*${expected}.*${actual}`),
    );
  });
});
