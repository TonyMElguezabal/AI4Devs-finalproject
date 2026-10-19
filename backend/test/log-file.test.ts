import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppLogger, createRotatingLogStream } from "../src/telemetry/logFile.ts";

// add-observability-telemetry (JOS-199), group 5 — Decision 5: a size-rotated local log, no worker threads.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "log-file-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("createRotatingLogStream", () => {
  it("appends lines to vid4you.log and creates the folder", () => {
    const folder = join(dir, "logs");
    const stream = createRotatingLogStream({ dir: folder });
    stream.write('{"msg":"one"}\n');
    stream.write('{"msg":"two"}\n');
    expect(readFileSync(join(folder, "vid4you.log"), "utf8")).toBe('{"msg":"one"}\n{"msg":"two"}\n');
  });

  it("rotates when the file would pass the size limit", () => {
    const stream = createRotatingLogStream({ dir, maxBytes: 20 });
    stream.write("a".repeat(15) + "\n");
    stream.write("b".repeat(15) + "\n");
    expect(readFileSync(join(dir, "vid4you.log.1"), "utf8")).toBe("a".repeat(15) + "\n");
    expect(readFileSync(join(dir, "vid4you.log"), "utf8")).toBe("b".repeat(15) + "\n");
  });

  it("keeps no more than 5 rotated files, dropping the oldest", () => {
    const stream = createRotatingLogStream({ dir, maxBytes: 10 });
    for (let i = 0; i < 9; i++) stream.write(`line-${i}....\n`);
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["vid4you.log", "vid4you.log.1", "vid4you.log.2", "vid4you.log.3", "vid4you.log.4", "vid4you.log.5"]);
    expect(existsSync(join(dir, "vid4you.log.6"))).toBe(false);
    expect(readFileSync(join(dir, "vid4you.log"), "utf8")).toBe("line-8....\n");
    expect(readFileSync(join(dir, "vid4you.log.5"), "utf8")).toBe("line-3....\n");
  });

  it("continues an existing file after a restart", () => {
    createRotatingLogStream({ dir }).write("first\n");
    createRotatingLogStream({ dir }).write("second\n");
    expect(readFileSync(join(dir, "vid4you.log"), "utf8")).toBe("first\nsecond\n");
  });
});

describe("createAppLogger", () => {
  it("writes the same JSON line to stdout and to the log file", () => {
    const lines: string[] = [];
    const logger = createAppLogger({ dir, stdout: { write: (chunk) => lines.push(chunk) } });
    logger.info({ requestId: "r1" }, "handled request");
    const fileLine = readFileSync(join(dir, "vid4you.log"), "utf8");
    expect(JSON.parse(fileLine)).toMatchObject({ msg: "handled request", requestId: "r1" });
    expect(lines).toEqual([fileLine]);
  });
});
