import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { isAlreadyRunning } from "../packaging/instance.ts";

// package-executables-build (JOS-205), task 1.6 — the single-instance probe.
let server: http.Server | undefined;
afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

async function listen(handler: http.RequestListener): Promise<number> {
  server = http.createServer(handler);
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  return (server.address() as AddressInfo).port;
}

describe("isAlreadyRunning", () => {
  it("is true when /health answers {\"ok\":true}", async () => {
    const port = await listen((_request, response) => response.setHeader("content-type", "application/json").end('{"ok":true}'));
    expect(await isAlreadyRunning(port)).toBe(true);
  });

  it("is false when the port answers something that is not Vid4You", async () => {
    const port = await listen((_request, response) => response.end("hello"));
    expect(await isAlreadyRunning(port)).toBe(false);
  });

  it("is false for a closed port", async () => {
    const port = await listen((_request, response) => response.end());
    await new Promise<void>((done) => server!.close(() => done()));
    expect(await isAlreadyRunning(port)).toBe(false);
  });
});
