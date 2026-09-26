import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRun,
  createScene,
  getScenesForRun,
  getSceneForRun,
  resetAll,
  resolveArtefactPath,
  deriveAndCreateProjectFolder,
} from "../src/db.ts";

beforeEach(() => {
  resetAll();
});

function makeSession(title: string) {
  const runId = randomUUID();
  createRun(runId, title, "a script", "en");
  return runId;
}

// consult-session (JOS-135) Decision 2 — scoping is structural, not a filter
// a caller has to remember to apply.
describe("Data access is scoped by session identifier (Decision 2)", () => {
  it("two sessions with the same title each return only their own scenes (2.1)", () => {
    const runA = makeSession("Same Title");
    const runB = makeSession("Same Title");
    createScene(randomUUID(), runA, 1, "success", 100, "scene A1");
    createScene(randomUUID(), runB, 1, "success", 100, "scene B1");
    createScene(randomUUID(), runB, 2, "success", 100, "scene B2");

    const scenesA = getScenesForRun(runA);
    const scenesB = getScenesForRun(runB);

    expect(scenesA).toHaveLength(1);
    expect(scenesA[0]!.instruction).toBe("scene A1");
    expect(scenesB).toHaveLength(2);
    expect(scenesB.every((s) => s.runId === runB)).toBe(true);
  });

  it("two sessions each with a scene ID 1 (idx 1) each show only their own (2.2)", () => {
    const runA = makeSession("A");
    const runB = makeSession("B");
    const sceneA1 = randomUUID();
    const sceneB1 = randomUUID();
    createScene(sceneA1, runA, 1, "success", 100, "A's scene 1");
    createScene(sceneB1, runB, 1, "success", 100, "B's scene 1");

    // getSceneForRun is the repository method Decision 2 requires: keyed by
    // (sessionId, sceneId), not sceneId alone — a scene id from another
    // session must not resolve through the wrong session's lookup.
    expect(getSceneForRun(runA, sceneA1)?.instruction).toBe("A's scene 1");
    expect(getSceneForRun(runB, sceneB1)?.instruction).toBe("B's scene 1");
    expect(getSceneForRun(runA, sceneB1)).toBeUndefined(); // B's scene, asked through A
    expect(getSceneForRun(runB, sceneA1)).toBeUndefined(); // A's scene, asked through B
  });

  it("a file reference resolving outside the session's project folder is refused (2.3)", () => {
    const folder = deriveAndCreateProjectFolder("Traversal Test", new Date());
    expect(() => resolveArtefactPath(folder, "../../../etc/passwd")).toThrow();
    expect(() => resolveArtefactPath(folder, "sub/../../escaped.txt")).toThrow();
    // A legitimate relative path within the folder still resolves fine.
    expect(() => resolveArtefactPath(folder, "scene-1.png")).not.toThrow();
  });
});
