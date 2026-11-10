import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.ts";

// JOS-275 — docs/api-spec.yml is the API contract; this keeps it and the registered routes from drifting apart.

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

/** Routes that are deliberately not in the contract. Each needs a reason. */
const NOT_IN_THE_CONTRACT = new Set([
  "get /", // the development placeholder page, not an API
]);

/** `method path` of every operation in the spec: a path is a 2-space key under `paths:`, a method a 4-space key under it. */
function operationsInSpec(): Set<string> {
  const lines = readFileSync(resolve(import.meta.dirname, "../../docs/api-spec.yml"), "utf8").split("\n");
  const operations = new Set<string>();
  let inPaths = false;
  let path = "";
  for (const line of lines) {
    if (/^\S/.test(line)) inPaths = line.startsWith("paths:");
    if (!inPaths) continue;
    const pathMatch = /^ {2}(\/\S*):\s*$/.exec(line);
    if (pathMatch) path = pathMatch[1]!;
    const methodMatch = /^ {4}(\w+):\s*$/.exec(line);
    if (methodMatch && HTTP_METHODS.includes(methodMatch[1]!)) operations.add(`${methodMatch[1]} ${path}`);
  }
  return operations;
}

async function operationsRegistered(): Promise<Set<string>> {
  const app = await buildApp();
  await app.ready();
  const paths = (app.swagger() as { paths: Record<string, Record<string, unknown>> }).paths;
  await app.close();
  return new Set(Object.entries(paths).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`)));
}

describe("docs/api-spec.yml and the registered routes", () => {
  it("document every route and have a route for every documented operation", async () => {
    const documented = operationsInSpec();
    const registered = await operationsRegistered();
    const undocumented = [...registered].filter((op) => !documented.has(op) && !NOT_IN_THE_CONTRACT.has(op)).sort();
    const missing = [...documented].filter((op) => !registered.has(op)).sort();
    expect({ undocumented, missing }).toEqual({ undocumented: [], missing: [] });
  });

  it("reads the spec: the parser finds the known operations", () => {
    const documented = operationsInSpec();
    expect(documented.size).toBeGreaterThan(40);
    expect(documented.has("post /sessions")).toBe(true);
  });
});
