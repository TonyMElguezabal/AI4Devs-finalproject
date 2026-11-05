// Throwaway server for the reports spike (JOS-175, task 2.1): the real server and routes with stubbed providers whose
// behaviour a mode file sets per stage, and a call log written by the stubs themselves (an independent record to compare
// the queries with). Not production code; run from `backend/` with a scratch DB_PATH, PROJECTS_ROOT and PROVIDER_KEY_PATH.
import { appendFileSync, readFileSync } from "node:fs";
import { setAlignmentProviderRegistry, setDecompositionDependencies, setReasoningProviderRegistry } from "../../../../backend/src/decompositionDependencies.ts";
import { setImageProviderRegistry } from "../../../../backend/src/imageProvider.ts";
import { setVideoProviderRegistry } from "../../../../backend/src/videoProvider.ts";
import { createSilentMp3, setVoiceProviderRegistry } from "../../../../backend/src/voiceProvider.ts";
import { recoverOnBoot, setAssemblyTool } from "../../../../backend/src/orchestrator.ts";
import { createStubAssemblyTool } from "../../../../backend/src/stubAssemblyTool.ts";
import { setRetryDelayConfig } from "../../../../backend/src/retry/stageAttemptRecorder.ts";
import { rebuildScheduler } from "../../../../backend/src/retry/retryScheduler.ts";
import { startAttemptTimeoutWatcher } from "../../../../backend/src/retry/attemptTimeoutWatcher.ts";
import { setScriptModerator } from "../../../../backend/src/scriptModeration.ts";
import { buildApp } from "../../../../backend/src/server.ts";

const DIR = process.env.SCRATCH_DIR!;
const png = Buffer.alloc(29);
png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
png.writeUInt32BE(13, 8); png.write("IHDR", 12, "ascii"); png.writeUInt32BE(1920, 16); png.writeUInt32BE(1088, 20);
const mp4 = Buffer.from("00000000667479706d703432", "hex");
const STEP = 0.25;

// Modes per stage for stub-a: "ok", "fail" (transient, always), "fail-once" (the first call after the mode changed), "hard" (not retryable).
// stub-b always succeeds. Every call is logged: stage, provider, the outcome it returned and its latency.
type Mode = "ok" | "fail" | "fail-once" | "hard";
let lastModes = "";
const onceDone = new Set<string>();
function outcomeFor(stage: string, provider: string): "success" | "transient" | "not-retryable" {
  const modes = readFileSync(DIR + "/mode.json", "utf8");
  if (modes !== lastModes) { lastModes = modes; onceDone.clear(); }
  const mode: Mode = provider === "stub-a" ? (JSON.parse(modes)[stage] ?? "ok") : "ok";
  if (mode === "fail") return "transient";
  if (mode === "hard") return "not-retryable";
  if (mode === "fail-once" && !onceDone.has(stage)) { onceDone.add(stage); return "transient"; }
  return "success";
}
async function call<T>(stage: string, provider: string, onResult: (outcome: "success" | "transient" | "not-retryable") => T): Promise<T> {
  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 40)));
  const outcome = outcomeFor(stage, provider);
  appendFileSync(DIR + "/calls.log", [stage, provider, outcome, Date.now() - started].join(" ") + "\n");
  return onResult(outcome);
}
const failure = (stage: string, outcome: "transient" | "not-retryable") => ({ kind: outcome === "transient" ? ("failed_transient" as const) : ("failed_not_retryable" as const), reason: `stub ${stage} ${outcome === "transient" ? "answered HTTP 503" : "rejected the input"}` });

const voice = (p: string) => ({ synthesize: () => call("voice", p, (o) => (o === "success" ? { kind: "success" as const, audio: createSilentMp3(17) } : failure("voice", o))) });
const alignment = (p: string) => ({ align: (_a: Uint8Array, script: string) => call("alignment", p, (o) => (o === "success" ? { kind: "success" as const, characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) } : failure("alignment", o))) });
const reasoning = (p: string) => ({ generate: (texts: readonly string[]) => call("reasoning", p, (o) => (o === "success" ? { kind: "success" as const, pairs: texts.map((_, i) => ({ image: "image " + (i + 1), video: "video " + (i + 1) })) } : failure("reasoning", o))) });
const image = (p: string) => ({ generate: () => call("image", p, (o) => (o === "success" ? { kind: "success" as const, image: { source: "bytes" as const, bytes: png, contentType: "image/png" } } : failure("image", o))) });
const video = (p: string) => ({
  submit: () => call("video", p, (o) => (o === "success" ? { kind: "submitted" as const, requestId: "req-" + Math.random() } : failure("video", o))),
  poll: async () => ({ kind: "success" as const, clip: { source: "bytes" as const, bytes: mp4 } }),
});

setDecompositionDependencies({ alignmentProvider: alignment("stub-a"), instructionGenerator: reasoning("stub-a") });
setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": alignment("stub-a"), "stub-b": alignment("stub-b") } });
setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": reasoning("stub-a"), "stub-b": reasoning("stub-b") } });
setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": voice("stub-a"), "stub-b": voice("stub-b") } });
setImageProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": image("stub-a"), "stub-b": image("stub-b") } });
setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": video("stub-a"), "stub-b": video("stub-b") } });
setAssemblyTool(createStubAssemblyTool({ kind: "success" }));
setRetryDelayConfig({ baseSeconds: 0.2, capSeconds: 0.5 });
setScriptModerator({ async moderate() { return { kind: "clean" as const }; } });

const app = await buildApp();
recoverOnBoot();
rebuildScheduler();
startAttemptTimeoutWatcher();
await app.listen({ port: Number(process.env.PORT), host: "127.0.0.1" });
console.log("listening on " + process.env.PORT);
