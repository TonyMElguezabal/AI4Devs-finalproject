import { z } from "zod";
import { stageApiKey } from "./keyStore.ts";
import { MODERATION_MAX_TIME_SECONDS, SCRIPT_MODERATION } from "./config/providers.ts";

// moderate-script-at-submission (JOS-187), design Decisions 2 and 4-6 — the
// submitted script is checked by the reasoning provider's own moderation
// endpoint before a session exists. One request, no SDK and no retry (the User
// is waiting, and resubmitting is the retry). No verdict means `unavailable`,
// so a script is never registered unchecked.

export type ModerationVerdict =
  | { kind: "clean" }
  | { kind: "flagged"; categories: string[] }
  | { kind: "unavailable"; reason: string };

/** The port `POST /sessions` depends on; tests install a stub, production the OpenAI adapter. */
export interface ScriptModerator {
  moderate(script: string): Promise<ModerationVerdict>;
}

const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";

const moderationSchema = z.object({
  results: z.array(z.object({ flagged: z.boolean(), categories: z.record(z.boolean()).default({}) })).min(1),
});

export function createOpenAiScriptModerator(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; timeoutMs?: number } = {},
): ScriptModerator {
  const fetchFn = options.fetchFn ?? fetch;
  // manage-providers-from-admin (JOS-218), Decision 11: the moderation endpoint is the reasoning vendor's, so it uses the
  // key of the active reasoning provider.
  const loadKey = options.loadKey ?? (() => stageApiKey("reasoning"));
  const timeoutMs = options.timeoutMs ?? MODERATION_MAX_TIME_SECONDS * 1000;

  return {
    async moderate(script) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch {
        return { kind: "unavailable", reason: "the content check has no credential configured" };
      }

      let response: Response;
      try {
        response = await fetchFn(OPENAI_MODERATIONS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: SCRIPT_MODERATION.model, input: script }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          kind: "unavailable",
          reason: timedOut
            ? `the content check did not answer within the ${Math.round(timeoutMs / 1000)} s time limit`
            : "the content check could not be reached",
        };
      }

      // The body is deliberately not read into the reason: it can carry raw provider detail.
      if (!response.ok) return { kind: "unavailable", reason: `the content check answered HTTP ${response.status}` };

      const parsed = moderationSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) return { kind: "unavailable", reason: "the content check's response was not understood" };

      const result = parsed.data.results[0]!;
      if (!result.flagged) return { kind: "clean" };
      return {
        kind: "flagged",
        categories: Object.entries(result.categories).filter(([, flagged]) => flagged).map(([name]) => name),
      };
    },
  };
}

let moderator: ScriptModerator = createOpenAiScriptModerator();

export function getScriptModerator(): ScriptModerator {
  return moderator;
}

export function setScriptModerator(next: ScriptModerator): void {
  moderator = next;
}

export function resetScriptModerator(): void {
  moderator = createOpenAiScriptModerator();
}
