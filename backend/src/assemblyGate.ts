import type { Scene, SceneState } from "./types.ts";

// gate-assembly-on-complete-scenes (JOS-150) — the one answer to "may assembly
// start?" (PRD §7.3, AC10, AC12). The session derivation and the assembly
// launcher both ask this, so the rule cannot drift between them.

/** A scene is settled once it reached a final scene state; anything else is
 * still generating. Defined as the complement of the final states, so a new
 * stage state is covered without an edit here. */
export function isSceneSettled(status: SceneState): boolean {
  return status === "chunk-complete" || status === "failed";
}

export type AssemblyGate =
  | { open: true }
  | { open: false; processingSceneIndexes: number[]; failedSceneIndexes: number[] };

const ascending = (a: number, b: number): number => a - b;

/** Open only when there is at least one scene and every scene is `chunk-complete`.
 * Otherwise closed, naming the scenes still processing and those that failed. */
export function assemblyGate(scenes: readonly Pick<Scene, "index" | "status">[]): AssemblyGate {
  if (scenes.length > 0 && scenes.every((scene) => scene.status === "chunk-complete")) return { open: true };
  return {
    open: false,
    processingSceneIndexes: scenes.filter((scene) => !isSceneSettled(scene.status)).map((scene) => scene.index).sort(ascending),
    failedSceneIndexes: scenes.filter((scene) => scene.status === "failed").map((scene) => scene.index).sort(ascending),
  };
}
