import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider } from "../src/alignmentProvider.ts";
import { getScenesForRun, resetAll, saveVisualStylePrompt } from "../src/db.ts";
import { resetDecompositionDependencies, setDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { decompositionLauncher, segmentStoredTimestamps, setDecompositionLogger } from "../src/decompositionPhase.ts";
import { retryDecomposition } from "../src/decompositionRetry.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";
import { NARRATED_STEP_SECONDS, narratedSession } from "./narratedSession.ts";

// admin-visual-style-prompt (JOS-201), group 3 — design Decision 3: the first decomposition, a manual retry and the boot
// relaunch all reach the generator through `registerDecomposition`, which passes the run's snapshot, never the live setting.

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  saveVisualStylePrompt("");
  resetImageProviderRegistry();
  resetDecompositionDependencies();
  setVideoStageStartDelayMs(9_999_999);
  setImageProviderRegistry({
    defaultIdentifier: "held-image-adapter",
    adapters: { "held-image-adapter": { generate: () => new Promise(() => {}) } },
  });
});

const alignment: AlignmentProvider = {
  async align(_audio, script) {
    return {
      kind: "success",
      characters: [...script].map((text, i) => ({ text, start: 0.1 + i * NARRATED_STEP_SECONDS, end: 0.1 + (i + 1) * NARRATED_STEP_SECONDS })),
    };
  },
};

function capturingGenerator(first?: () => VisualInstructionResult) {
  const styles: Array<string | undefined> = [];
  let calls = 0;
  const generator: VisualInstructionGenerator = {
    async generate(texts, _language, visualStylePrompt) {
      styles.push(visualStylePrompt);
      calls += 1;
      if (calls === 1 && first) return first();
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
  return { generator, styles };
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("The run's style snapshot reaches the generator", () => {
  it("sends the snapshot on the first decomposition, not a style saved afterwards", async () => {
    saveVisualStylePrompt("style A");
    const runId = narratedSession();
    saveVisualStylePrompt("style B");
    const { generator, styles } = capturingGenerator();
    expect((await obtainNarrationTimestamps(runId, alignment)).ok).toBe(true);

    await segmentStoredTimestamps(runId, generator);

    expect(styles).toEqual(["style A"]);
    expect(getScenesForRun(runId)).toHaveLength(2);
  });

  it("sends the snapshot on a manual retry after the setting changed", async () => {
    saveVisualStylePrompt("style A");
    const runId = narratedSession();
    const { generator, styles } = capturingGenerator(() => ({ kind: "failed_transient", reason: "the reasoning provider answered HTTP 503" }));
    await obtainNarrationTimestamps(runId, alignment);
    await segmentStoredTimestamps(runId, generator);
    expect(getScenesForRun(runId)).toHaveLength(0);
    saveVisualStylePrompt("style B");
    setDecompositionDependencies({ alignmentProvider: alignment, instructionGenerator: generator });

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(styles).toEqual(["style A", "style A"]);
  });

  it("sends the snapshot when the boot relaunch resumes an interrupted decomposition", async () => {
    saveVisualStylePrompt("style A");
    const runId = narratedSession();
    saveVisualStylePrompt("style B");
    const { generator, styles } = capturingGenerator();
    setDecompositionDependencies({ alignmentProvider: alignment, instructionGenerator: generator });

    decompositionLauncher.launch(runId);

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(styles).toEqual(["style A"]);
  });

  it("sends an empty style for a run created without one", async () => {
    const runId = narratedSession();
    saveVisualStylePrompt("style B");
    const { generator, styles } = capturingGenerator();
    await obtainNarrationTimestamps(runId, alignment);
    await segmentStoredTimestamps(runId, generator);
    expect(styles).toEqual([""]);
  });
});

describe("The style is logged by length only", () => {
  it("logs visual_style_prompt_chars on the attempt and never the text", async () => {
    const records: Array<Record<string, unknown>> = [];
    setDecompositionLogger({ info: (fields) => void records.push(fields) });
    try {
      const style = "Warry, a 2D cartoon caricature in a navy suit";
      saveVisualStylePrompt(style);
      const runId = narratedSession();
      await obtainNarrationTimestamps(runId, alignment);
      await segmentStoredTimestamps(runId, capturingGenerator().generator);

      expect(records.some((record) => record.visual_style_prompt_chars === style.length)).toBe(true);
      expect(JSON.stringify(records)).not.toContain("Warry");
    } finally {
      setDecompositionLogger({ info: () => undefined });
    }
  });
});
