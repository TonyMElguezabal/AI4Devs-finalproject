import { loadCredential } from "./config/credentials.ts";
import { PER_PHASE_MAX_TIME_SECONDS } from "./config/providers.ts";
import { parseAlignedCharacters, type TimestampCharacter } from "./narrationTimestamps.ts";

// obtain-narration-timestamps (JOS-139) Decision 6 — the alignment stage's
// provider (PRD §11, §11.1): ElevenLabs Forced Alignment, same account as the
// voice. The adapter makes exactly one request: no SDK and no retry loop, since
// retries belong to the retry policy (JOS-184) and a hidden retry would
// multiply its budget.

export type AlignmentResult =
  | { kind: "success"; characters: TimestampCharacter[] }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string }
  | { kind: "invalid_output"; reason: string };

/** The port the timestamps step depends on; tests pass a stub, production the ElevenLabs adapter. */
export interface AlignmentProvider {
  align(audio: Uint8Array, script: string): Promise<AlignmentResult>;
}

const ELEVENLABS_FORCED_ALIGNMENT_URL = "https://api.elevenlabs.io/v1/forced-alignment";

/** Product owner rule (as for voice): not retryable for 4xx except 408 and 429; transient otherwise. */
function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

export function createElevenLabsAlignmentProvider(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; timeoutMs?: number } = {},
): AlignmentProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const loadKey = options.loadKey ?? (() => loadCredential("ELEVENLABS_KEY"));
  const timeoutMs = options.timeoutMs ?? PER_PHASE_MAX_TIME_SECONDS.alignment * 1000;

  return {
    async align(audio, script) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        // The loader's message names the credential and never contains a value.
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing credential 'ELEVENLABS_KEY'" };
      }

      // The script goes as stored: not trimmed, not normalised (PRD §4.2).
      const form = new FormData();
      // A copy backed by a plain ArrayBuffer, which is what Blob accepts.
      form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "voice-over.mp3");
      form.append("text", script);

      let response: Response;
      try {
        response = await fetchFn(ELEVENLABS_FORCED_ALIGNMENT_URL, {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          kind: "failed_transient",
          reason: timedOut
            ? `the alignment provider did not answer within the ${Math.round(timeoutMs / 1000)} s time limit`
            : "the alignment provider could not be reached",
        };
      }

      if (!response.ok) {
        // The body is deliberately not read into the reason: it can carry raw provider detail.
        return { kind: classifyHttpStatus(response.status), reason: `the alignment provider answered HTTP ${response.status}` };
      }

      const parsed = parseAlignedCharacters(await response.json().catch(() => null));
      if (!parsed.ok) return { kind: "invalid_output", reason: parsed.reason };
      return { kind: "success", characters: parsed.characters };
    },
  };
}
