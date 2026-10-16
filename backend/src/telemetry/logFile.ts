import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { multistream, pino, type Logger } from "pino";

// add-observability-telemetry (JOS-199), design Decision 5 — a size-rotated local log written by us. Pino
// transports (pino-roll and the like) run in worker threads that load modules by path, which fails inside a
// single-executable bundle. Synchronous appends are fine at this volume. The log never leaves the machine.
const FILE_NAME = "vid4you.log";

export function createRotatingLogStream(options: { dir: string; maxBytes?: number; maxFiles?: number }): {
  write: (chunk: string) => void;
} {
  const { dir, maxBytes = 10 * 1024 * 1024, maxFiles = 5 } = options;
  mkdirSync(dir, { recursive: true });
  const current = join(dir, FILE_NAME);
  let size = existsSync(current) ? statSync(current).size : 0;

  const rotate = () => {
    rmSync(`${current}.${maxFiles}`, { force: true });
    for (let n = maxFiles - 1; n >= 1; n--) {
      if (existsSync(`${current}.${n}`)) renameSync(`${current}.${n}`, `${current}.${n + 1}`);
    }
    renameSync(current, `${current}.1`);
    size = 0;
  };

  return {
    write(chunk: string) {
      const bytes = Buffer.byteLength(chunk);
      if (size > 0 && size + bytes > maxBytes) rotate();
      appendFileSync(current, chunk);
      size += bytes;
    },
  };
}

/** The application logger: today's stdout output plus the rotating file, both receiving the same JSON lines. */
export function createAppLogger(options: { dir: string; stdout?: { write: (chunk: string) => unknown }; maxBytes?: number }): Logger {
  const file = createRotatingLogStream({ dir: options.dir, maxBytes: options.maxBytes });
  return pino({ level: "info" }, multistream([{ stream: options.stdout ?? process.stdout }, { stream: file }]));
}
