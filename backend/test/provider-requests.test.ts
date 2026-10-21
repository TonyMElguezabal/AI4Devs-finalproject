import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// configure-providers-and-parameters (JOS-174), task 4.4 — spec "Exactly one active provider per stage": the
// model, endpoint and voice settings read from the settings files are what each provider request carries.
// Each test imports a fresh module graph under an override, with a fake `fetch`: nothing reaches a provider.
// The image model is covered in provider-binding.test.ts (the request URL after a model change).

let dir: string;
let savedSettingsPath: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vid4you-requests-"));
  savedSettingsPath = process.env.SETTINGS_PATH;
});

afterEach(() => {
  if (savedSettingsPath === undefined) delete process.env.SETTINGS_PATH;
  else process.env.SETTINGS_PATH = savedSettingsPath;
  vi.resetModules();
  rmSync(dir, { recursive: true, force: true });
});

function restartWith(override: unknown): void {
  const path = join(dir, "settings.json");
  writeFileSync(path, JSON.stringify(override));
  process.env.SETTINGS_PATH = path;
  vi.resetModules();
}

type FetchCall = { url: string; init?: RequestInit };
function recordingFetch(answer: (url: string) => Response): { fetchFn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return answer(url);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}
const serverError = () => new Response("{}", { status: 500 });

describe("The reasoning provider", () => {
  it("is sent the configured model", async () => {
    restartWith({ decomposition: { model: "reasoning-model-x" } });
    const { createOpenAiVisualInstructionGenerator } = await import("../src/visualInstructions.ts");
    const { fetchFn, calls } = recordingFetch(serverError);
    await createOpenAiVisualInstructionGenerator({ fetchFn, loadKey: () => "key" }).generate(["A script."], "en");
    expect(JSON.parse(calls[0]!.init!.body as string).model).toBe("reasoning-model-x");
  });
});

describe("The voice provider", () => {
  it("is sent the configured voice, model, output format and speed", async () => {
    restartWith({ voice: { voiceId: "voice-x", model: "voice-model-x", outputFormat: "mp3_22050_32", speed: 1.1 } });
    const store = await import("../src/db.ts");
    const { setVoiceProviderRegistry } = await import("../src/voiceProvider.ts");
    const { generateVoiceOver } = await import("../src/voiceOverPhase.ts");

    const requests: unknown[] = [];
    // Not retryable, so no retry is scheduled and no timer outlives the test.
    setVoiceProviderRegistry({
      defaultIdentifier: "capture-voice",
      adapters: {
        "capture-voice": {
          synthesize: async (request) => {
            requests.push(request);
            return { kind: "failed_not_retryable", reason: "capture only" };
          },
        },
      },
    });
    store.resetAll();
    const runId = "01J00000000000000000000176";
    store.createRun(runId, "Voice settings", "A short script.", "en");
    await generateVoiceOver(runId);
    store.resetAll();

    expect(requests).toEqual([
      { text: "A short script.", language: "en", voiceId: "voice-x", model: "voice-model-x", outputFormat: "mp3_22050_32", speed: 1.1 },
    ]);
  });

  it("puts that voice, format, model and speed in the ElevenLabs request", async () => {
    restartWith({ voice: { voiceId: "voice-x" } }); // any valid settings: the adapter takes everything from its request
    const { createElevenLabsVoiceProvider } = await import("../src/voiceProvider.ts");
    const { fetchFn, calls } = recordingFetch(serverError);
    await createElevenLabsVoiceProvider({ fetchFn, loadKey: () => "key" }).synthesize({
      text: "A short script.",
      language: "en",
      voiceId: "voice-x",
      model: "voice-model-x",
      outputFormat: "mp3_22050_32",
      speed: 1.1,
    });
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-x/with-timestamps?output_format=mp3_22050_32");
    const body = JSON.parse(calls[0]!.init!.body as string);
    expect(body.model_id).toBe("voice-model-x");
    expect(body.voice_settings).toEqual({ speed: 1.1 });
  });
});

describe("The alignment provider", () => {
  it("is sent to the configured endpoint", async () => {
    restartWith({ alignment: { endpoint: "/v2/forced-alignment" } });
    const { createElevenLabsAlignmentProvider } = await import("../src/alignmentProvider.ts");
    const { fetchFn, calls } = recordingFetch(serverError);
    await createElevenLabsAlignmentProvider({ fetchFn, loadKey: () => "key" }).align(new Uint8Array([1, 2, 3]), "A script.");
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v2/forced-alignment");
  });

  it("is sent to the shipped endpoint when none is configured", async () => {
    restartWith({});
    const { createElevenLabsAlignmentProvider } = await import("../src/alignmentProvider.ts");
    const { fetchFn, calls } = recordingFetch(serverError);
    await createElevenLabsAlignmentProvider({ fetchFn, loadKey: () => "key" }).align(new Uint8Array([1, 2, 3]), "A script.");
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/forced-alignment");
  });
});

describe("The video provider", () => {
  it("builds its submit URL from the configured endpoint", async () => {
    restartWith({ video: { endpoint: "/openapi/v2/other/model/image-to-video" } });
    const { createRunningHubVideoProvider } = await import("../src/videoProvider.ts");
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const { fetchFn, calls } = recordingFetch((url) =>
      url.includes("/media/upload")
        ? json({ code: 0, msg: "success", errorMessages: null, data: { type: "image", download_url: "https://cdn.example/a.png", fileName: "f.png", size: "1" } })
        : json({ taskId: "task-1", status: "QUEUED", errorCode: "", errorMessage: "", results: null, clientId: "" }),
    );
    await createRunningHubVideoProvider({ fetchFn, loadKey: () => "key" }).submit({
      imageBytes: Buffer.alloc(29),
      instruction: "animate the scene",
      durationSeconds: 8,
    });
    expect(calls.some((call) => call.url.endsWith("/openapi/v2/other/model/image-to-video"))).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/hailuo-h3/image-to-video"))).toBe(false);
  });
});
