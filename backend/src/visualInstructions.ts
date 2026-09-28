import { z } from "zod";
import { loadCredential } from "./config/credentials.ts";
import { DECOMPOSITION_PROVIDER, PER_PHASE_MAX_TIME_SECONDS } from "./config/providers.ts";

// assign-scene-identifiers (JOS-144) Decision 4 — the IMAGE and VIDEO
// instructions for every fragment come from the reasoning provider (PRD §11,
// §5 step 5) in ONE request, using the chat-completions JSON shape verified in
// define-provider-configuration (JOS-165, report step 5b). The adapter makes
// exactly one request: no SDK and no retry loop, since retries belong to the
// retry policy (JOS-184) and a hidden retry would multiply its budget.

export interface VisualInstructionPair {
  image: string;
  video: string;
}

export type VisualInstructionResult =
  | { kind: "success"; pairs: VisualInstructionPair[] }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string }
  | { kind: "invalid_output"; reason: string };

/** The port registration depends on; tests pass a stub, production the OpenAI adapter. */
export interface VisualInstructionGenerator {
  generate(fragmentTexts: readonly string[], language: string): Promise<VisualInstructionResult>;
}

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You write visual instructions for the scenes of a narrated video.",
  "You receive the scenes in order, each with the exact fragment of the script it narrates.",
  "For every scene, write an `image` instruction (a single horizontal 16:9 still image that illustrates the fragment) and a `video` instruction (how to animate that image for the length of the fragment).",
  "Do not change, rewrite, summarise, merge or split the fragments, and do not add or remove scenes.",
  'Answer with a JSON object {"scenes": [{"image": string, "video": string}, ...]} holding exactly one entry per scene, in the same order.',
  "Write the instructions in English, whatever the script's language.",
].join(" ");

const nonEmptyInstruction = z.string().transform((value) => value.trim()).pipe(z.string().min(1));

const instructionsSchema = z.object({
  scenes: z.array(z.object({ image: nonEmptyInstruction, video: nonEmptyInstruction })),
});

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

/** Product owner rule (as for voice): not retryable for 4xx except 408 and 429; transient otherwise. */
function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

export function createOpenAiVisualInstructionGenerator(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; timeoutMs?: number } = {},
): VisualInstructionGenerator {
  const fetchFn = options.fetchFn ?? fetch;
  const loadKey = options.loadKey ?? (() => loadCredential("OPENAI_KEY"));
  const timeoutMs = options.timeoutMs ?? PER_PHASE_MAX_TIME_SECONDS.decomposition * 1000;

  return {
    async generate(fragmentTexts, language) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        // The loader's message names the credential and never contains a value.
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing credential 'OPENAI_KEY'" };
      }

      const userMessage = JSON.stringify({
        language,
        scenes: fragmentTexts.map((text, index) => ({ index: index + 1, text })),
      });

      let response: Response;
      try {
        response = await fetchFn(OPENAI_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: DECOMPOSITION_PROVIDER.model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          kind: "failed_transient",
          reason: timedOut
            ? `the reasoning provider did not answer within the ${Math.round(timeoutMs / 1000)} s time limit`
            : "the reasoning provider could not be reached",
        };
      }

      if (!response.ok) {
        // The body is deliberately not read into the reason: it can carry raw provider detail.
        return { kind: classifyHttpStatus(response.status), reason: `the reasoning provider answered HTTP ${response.status}` };
      }

      const completion = completionSchema.safeParse(await response.json().catch(() => null));
      if (!completion.success) {
        return { kind: "invalid_output", reason: "the reasoning provider's response had no message content" };
      }

      let content: unknown;
      try {
        content = JSON.parse(completion.data.choices[0]!.message.content);
      } catch {
        return { kind: "invalid_output", reason: "the reasoning provider's instructions were not valid JSON" };
      }

      const instructions = instructionsSchema.safeParse(content);
      if (!instructions.success) {
        return { kind: "invalid_output", reason: "the reasoning provider's instructions were missing or empty" };
      }
      if (instructions.data.scenes.length !== fragmentTexts.length) {
        return {
          kind: "invalid_output",
          reason: `the reasoning provider returned ${instructions.data.scenes.length} instruction pairs for ${fragmentTexts.length} scenes`,
        };
      }
      return { kind: "success", pairs: instructions.data.scenes };
    },
  };
}
