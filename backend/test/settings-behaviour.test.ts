import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// configure-providers-and-parameters (JOS-174), group 4 — behaviour follows the settings, established
// work does not change. `providers.ts` reads the settings once, at import, so each test imports a fresh
// module graph after pointing `SETTINGS_PATH` at a scratch override. That is also what a restart is.

let dir: string;
let savedSettingsPath: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vid4you-behaviour-"));
  savedSettingsPath = process.env.SETTINGS_PATH;
});

afterEach(() => {
  if (savedSettingsPath === undefined) delete process.env.SETTINGS_PATH;
  else process.env.SETTINGS_PATH = savedSettingsPath;
  vi.resetModules();
  rmSync(dir, { recursive: true, force: true });
});

/** The next imports see this override (or none). Calling it again is a restart with other settings. */
function restartWith(override?: unknown): void {
  const path = join(dir, "settings.json");
  if (override !== undefined) writeFileSync(path, JSON.stringify(override));
  process.env.SETTINGS_PATH = path;
  // manage-providers-from-admin (JOS-218): the provider sections only seed the first profiles, so a restart under other
  // settings, in these tests, is a first start: the profiles of the previous test go.
  const store = new DatabaseSync(process.env.DB_PATH ?? "data/skeleton.sqlite");
  store.exec("DELETE FROM provider_profiles");
  store.close();
  vi.resetModules();
}

const SIX_TO_TEN = { video: { admittedDurationSeconds: { min: 6, max: 10 } }, segmentation: { lowerBoundSeconds: 6 } };

describe("Clip durations and segmentation follow the configured range (spec clip-duration-request)", () => {
  const interval = { startSeconds: 0, endSeconds: 12.3 };

  it("requests 12 s for a 12.3 s interval with the shipped 5-15 s range", async () => {
    restartWith();
    const { requestedClipDuration } = await import("../src/admittedDurations.ts");
    expect(requestedClipDuration(interval)).toMatchObject({ seconds: 12, warning: null });
  });

  it("requests 10 s for a 12.3 s interval when the admitted durations are 6-10 s", async () => {
    restartWith(SIX_TO_TEN);
    const { requestedClipDuration } = await import("../src/admittedDurations.ts");
    const requested = requestedClipDuration(interval);
    expect(requested.seconds).toBe(10);
    expect(requested.warning).toBe("exceeds-maximum");
    expect(requested.factor).toBeCloseTo(1.23, 10);
  });

  /** One sentence narrated for 4 s: below the shipped 5 s lower bound, above a configured 3 s one. */
  async function segmentFourSecondScript() {
    const { segmentScript } = await import("../src/segmentation.ts");
    const script = "Scene 1 is here.";
    const characters = [...script].map((text, position) => ({ text, start: position * 0.25, end: (position + 1) * 0.25 }));
    const result = segmentScript(script, "en", characters, 4);
    if (!result.ok) throw new Error(`expected fragments, got: ${result.reason}`);
    return result.fragments;
  }

  it("flags a 4 s script as below the shipped lower bound of 5 s", async () => {
    restartWith();
    expect((await segmentFourSecondScript())[0]!.exception).toBe("script-below-lower-bound");
  });

  it("accepts the same script when the configured lower bound is 3 s", async () => {
    restartWith({ video: { admittedDurationSeconds: { min: 3, max: 15 } }, segmentation: { lowerBoundSeconds: 3 } });
    expect((await segmentFourSecondScript())[0]!.exception).toBeUndefined();
  });
});

describe("A stage with no maximum time is not timed (spec stage-execution-time-limit)", () => {
  const noAnswerFetch = () => vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}", { status: 500 }));
  const signalOf = (fetchFn: ReturnType<typeof noAnswerFetch>): AbortSignal | null | undefined => fetchFn.mock.calls[0]![1]?.signal;

  const adapters: Array<{ stage: string; send: (fetchFn: ReturnType<typeof noAnswerFetch>) => Promise<unknown> }> = [
    {
      stage: "image",
      send: async (fetchFn) => {
        const { createFalAiImageProvider } = await import("../src/imageProvider.ts");
        return createFalAiImageProvider({ fetchFn: fetchFn as unknown as typeof fetch, loadKey: () => "key" }).generate("a lighthouse");
      },
    },
    {
      stage: "alignment",
      send: async (fetchFn) => {
        const { createElevenLabsAlignmentProvider } = await import("../src/alignmentProvider.ts");
        return createElevenLabsAlignmentProvider({ fetchFn: fetchFn as unknown as typeof fetch, loadKey: () => "key" }).align(
          new Uint8Array([1, 2, 3]),
          "A script.",
        );
      },
    },
    {
      stage: "decomposition",
      send: async (fetchFn) => {
        const { createOpenAiVisualInstructionGenerator } = await import("../src/visualInstructions.ts");
        return createOpenAiVisualInstructionGenerator({ fetchFn: fetchFn as unknown as typeof fetch, loadKey: () => "key" }).generate(
          ["A script."],
          "en",
        );
      },
    },
  ];

  it.each(adapters)("sends the $stage request with no timeout when its maximum time is null", async ({ stage, send }) => {
    restartWith({ maxTimeSeconds: { [stage]: null } });
    const fetchFn = noAnswerFetch();
    await send(fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(signalOf(fetchFn)).toBeUndefined();
  });

  it.each(adapters)("sends the $stage request with a timeout when its maximum time is configured", async ({ stage, send }) => {
    restartWith({ maxTimeSeconds: { [stage]: 40 } });
    const fetchFn = noAnswerFetch();
    await send(fetchFn);
    expect(signalOf(fetchFn)).toBeInstanceOf(AbortSignal);
  });

  const SENT_AT = "2026-01-01T00:00:00.000Z";

  it("gives an attempt of a null-limit stage no deadline, however long it has been in flight", async () => {
    restartWith({ maxTimeSeconds: { voice: null } });
    const { attemptDeadline, hasExpired } = await import("../src/retry/attemptDeadline.ts");
    expect(attemptDeadline({ stage: "voice-over", sentAt: SENT_AT })).toBeNull();
    expect(hasExpired({ stage: "voice-over", sentAt: SENT_AT }, new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("uses a configured maximum time as the deadline, and each stage its own", async () => {
    restartWith({ maxTimeSeconds: { voice: 90, image: 10 } });
    const { attemptDeadline } = await import("../src/retry/attemptDeadline.ts");
    expect(attemptDeadline({ stage: "voice-over", sentAt: SENT_AT })?.getTime()).toBe(new Date(SENT_AT).getTime() + 90_000);
    expect(attemptDeadline({ stage: "image", sentAt: SENT_AT })?.getTime()).toBe(new Date(SENT_AT).getTime() + 10_000);
  });
});

describe("A restart with other settings leaves established work alone (spec, PRD §11.2)", () => {
  // A ULID, the shape the session routes accept.
  const RUN_ID = "01J00000000000000000000174";
  const FIRST = "Primera frase de la prueba.";
  const SECOND = "Segunda frase de la prueba.";
  const SCRIPT = `${FIRST} ${SECOND}`;
  const stubGenerator = { generate: async (texts: readonly string[]) => ({ kind: "success" as const, pairs: texts.map((_, i) => ({ image: `i${i}`, video: `v${i}` })) }) };

  /** Registers a Spanish session under the shipped settings and returns what was established. */
  async function establishSpanishSession() {
    restartWith();
    const store = await import("../src/db.ts");
    const { registerDecomposition } = await import("../src/sceneRegistration.ts");
    store.resetAll();
    store.createRun(RUN_ID, "Restart", SCRIPT, "es");
    const registered = await registerDecomposition(
      RUN_ID,
      [
        { text: FIRST, narrationInterval: { startSeconds: 0, endSeconds: 12.3 } },
        { text: SECOND, narrationInterval: { startSeconds: 12.3, endSeconds: 20.1 } },
      ],
      stubGenerator,
      20.1,
    );
    if (!registered.ok) throw new Error(`registration failed: ${JSON.stringify(registered)}`);
    const established = store.getScenesForRun(RUN_ID).map((scene) => ({
      requestedDurationSeconds: scene.requestedDurationSeconds,
      durationWarning: scene.durationWarning,
      speedFactor: scene.speedFactor,
      speedFactorWarning: scene.speedFactorWarning,
    }));
    store.db.close(); // the application stops
    return established;
  }

  it("keeps each chunk's requested duration, speed factor and warnings when the admitted durations change", async () => {
    const before = await establishSpanishSession();
    expect(before.map((scene) => scene.requestedDurationSeconds)).toEqual([12, 8]);

    restartWith(SIX_TO_TEN);
    const store = await import("../src/db.ts");
    const after = store.getScenesForRun(RUN_ID).map((scene) => ({
      requestedDurationSeconds: scene.requestedDurationSeconds,
      durationWarning: scene.durationWarning,
      speedFactor: scene.speedFactor,
      speedFactorWarning: scene.speedFactorWarning,
    }));
    expect(after).toEqual(before);
    store.resetAll();
  });

  it("still serves an existing Spanish session after Spanish is removed, and refuses a new one in Spanish", async () => {
    await establishSpanishSession();

    restartWith({ languages: [{ code: "en", label: "English" }] });
    const { buildApp } = await import("../src/server.ts");
    const app = await buildApp();
    try {
      await app.ready();

      const languages = await app.inject({ method: "GET", url: "/languages" });
      expect(JSON.parse(languages.body)).toEqual([{ code: "en", label: "English" }]);

      const existing = await app.inject({ method: "GET", url: `/sessions/${RUN_ID}` });
      expect(existing.statusCode).toBe(200);
      expect(JSON.parse(existing.body).session.language).toBe("es");

      const created = await app.inject({
        method: "POST",
        url: "/sessions",
        payload: { title: "Nueva", script: "Una frase nueva.", language: "es" },
      });
      expect(created.statusCode).toBe(400);
    } finally {
      await app.close();
      (await import("../src/db.ts")).resetAll();
    }
  });

  it("does not consult the supported-language list when it works on an existing Spanish session", async () => {
    restartWith({ languages: [{ code: "en", label: "English" }] });
    const { findSentences } = await import("../src/sentences.ts");
    expect(findSentences(SCRIPT, "es")).toHaveLength(2);
  });
});
