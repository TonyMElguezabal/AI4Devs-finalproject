import { loadCredential } from "./config/credentials.ts";

// generate-voice-over (JOS-136) Decision 4 — the voice stage's provider (PRD
// §11): ElevenLabs text-to-speech with timestamps. The adapter makes exactly
// one request: no SDK and no retry loop, since retries belong to the retry
// policy (JOS-184) and a hidden retry would multiply its budget. The call is
// synchronous: the audio comes back in the same round trip, so there is no job
// to poll after a restart.
//
// No default time limit: the 10 s in the constants module was measured on a
// 142-character script, while this story sends scripts of any length (design
// Decision 5). The per-phase maximum belongs to JOS-185, which passes it in.

export interface VoiceSynthesisRequest {
  /** The session's stored script, exactly as stored (PRD §4.2). */
  text: string;
  language: string;
  voiceId: string;
  model: string;
  outputFormat: string;
  /** `"default"` leaves the provider's own speed; a number overrides it. */
  speed: "default" | number;
}

export type VoiceSynthesisResult =
  | {
      kind: "success";
      audio: Uint8Array;
      /** The provider's own character timestamps, unmodified; absent when it returned none. */
      nativeTimestamps?: unknown;
      providerRequestId?: string;
    }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string };

/** The port the voice phase depends on; tests pass a stub, production the ElevenLabs adapter. */
export interface VoiceProvider {
  synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult>;
}

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

/** Product owner rule (design Decision 4): not retryable for 4xx except 408 and 429; transient otherwise. */
function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createElevenLabsVoiceProvider(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; timeoutMs?: number } = {},
): VoiceProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const loadKey = options.loadKey ?? (() => loadCredential("ELEVENLABS_KEY"));
  const timeoutMs = options.timeoutMs;

  return {
    async synthesize(request) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        // The loader's message names the credential and never contains a value.
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing credential 'ELEVENLABS_KEY'" };
      }

      const url = `${ELEVENLABS_BASE_URL}/${encodeURIComponent(request.voiceId)}/with-timestamps?output_format=${encodeURIComponent(request.outputFormat)}`;
      // The script goes as stored: not trimmed, not normalised (PRD §4.2).
      const body: Record<string, unknown> = { text: request.text, model_id: request.model, language_code: request.language };
      if (request.speed !== "default") body.voice_settings = { speed: request.speed };

      let response: Response;
      try {
        response = await fetchFn(url, {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          kind: "failed_transient",
          reason:
            timedOut && timeoutMs !== undefined
              ? `the voice provider did not answer within the ${Math.round(timeoutMs / 1000)} s time limit`
              : "the voice provider could not be reached",
        };
      }

      if (!response.ok) {
        // The body is deliberately not read into the reason: it can carry raw provider detail.
        return { kind: classifyHttpStatus(response.status), reason: `the voice provider answered HTTP ${response.status}` };
      }

      const payload: unknown = await response.json().catch(() => null);
      if (!isRecord(payload) || typeof payload.audio_base64 !== "string" || payload.audio_base64.length === 0) {
        return { kind: "failed_transient", reason: "the voice provider's response did not contain audio" };
      }

      const result: VoiceSynthesisResult = { kind: "success", audio: Buffer.from(payload.audio_base64, "base64") };
      if (payload.alignment !== undefined && payload.alignment !== null) result.nativeTimestamps = payload.alignment;
      const requestId = response.headers.get("request-id");
      if (requestId) result.providerRequestId = requestId;
      return result;
    },
  };
}

/** The modes the stub adapter can be configured for (group 5 and later tests). */
export type StubVoiceProviderMode =
  | "success"
  | "success-without-timestamps"
  | "transient-failure"
  | "not-retryable-failure"
  | "undecodable-audio"
  | "empty-audio"
  | "hang";

const MP3_FRAME_BYTES = 417; // MPEG-1 Layer III, 44.1 kHz, 128 kbit/s, no padding: 1152 samples, about 26.1 ms
const MP3_FRAME_SECONDS = 1152 / 44100;

/** Silent audio made of valid MP3 frames, so a real probe can decode it and measure a duration. */
export function createSilentMp3(seconds: number): Uint8Array {
  const frame = Buffer.alloc(MP3_FRAME_BYTES);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  return Buffer.concat(Array.from({ length: Math.max(1, Math.round(seconds / MP3_FRAME_SECONDS)) }, () => frame));
}

function stubTimestamps(text: string): unknown {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index * 0.05),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
  };
}

/** A deterministic stand-in for `VoiceProvider`, used by every test in this story instead of the real ElevenLabs adapter. */
export function createStubVoiceProvider(
  mode: StubVoiceProviderMode,
  options: { audioSeconds?: number } = {},
): VoiceProvider & { calls: VoiceSynthesisRequest[]; release: () => void } {
  const calls: VoiceSynthesisRequest[] = [];
  let releaseHeld: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });

  return {
    calls,
    release: () => releaseHeld(),
    async synthesize(request) {
      calls.push(request);
      switch (mode) {
        case "hang":
          await held;
          return { kind: "success", audio: createSilentMp3(options.audioSeconds ?? 1), providerRequestId: "stub-request-hang" };
        case "success":
          return {
            kind: "success",
            audio: createSilentMp3(options.audioSeconds ?? 1),
            nativeTimestamps: stubTimestamps(request.text),
            providerRequestId: "stub-request-1",
          };
        case "success-without-timestamps":
          return { kind: "success", audio: createSilentMp3(options.audioSeconds ?? 1), providerRequestId: "stub-request-1" };
        case "undecodable-audio":
          return { kind: "success", audio: Buffer.from("this is not an mp3"), providerRequestId: "stub-request-1" };
        case "empty-audio":
          return { kind: "success", audio: new Uint8Array(0), providerRequestId: "stub-request-1" };
        case "transient-failure":
          return { kind: "failed_transient", reason: "stub: transient voice provider error (503)" };
        case "not-retryable-failure":
          return { kind: "failed_not_retryable", reason: "stub: voice provider rejected the input" };
      }
    },
  };
}
