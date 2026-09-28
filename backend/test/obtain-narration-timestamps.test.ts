import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import {
  createRun,
  getNarrationTimestamps,
  getRun,
  getStageAttempts,
  getVoiceOver,
  insertVoiceOver,
  clearRunFailure,
  resetAll,
  resolveArtefactPath,
  setRunFailure,
  writeArtefactOnce,
} from "../src/db.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { createDecompositionFailure } from "../src/sessionStateMachine.ts";

// obtain-narration-timestamps (JOS-139), group 4 — PRD §5 step 3, §10.3, §11.1:
// native timestamps first, forced alignment when they are missing or unusable
// (in the same attempt), a failure attributed to the decomposition phase, and
// after an unusable finding every later attempt goes straight to alignment.
// The voice provider is never a dependency of this step, so it cannot be called.

const SCRIPT = "Hi there. Bye now.";
const STEP = 0.1;
const DURATION = SCRIPT.length * STEP;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);

beforeEach(() => {
  resetAll();
});

type NativeRaw = unknown;

function nativeFor(text: string, step = STEP): NativeRaw {
  const characters = [...text];
  return {
    audio_base64: "ignored",
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => i * step),
      character_end_times_seconds: characters.map((_, i) => (i + 1) * step),
    },
  };
}

function alignedFor(text: string, offset = 0.1) {
  return [...text].map((character, i) => ({ text: character, start: offset + i * STEP, end: offset + (i + 1) * STEP }));
}

/** A session with a stored narration; `native` is the raw file the voice provider returned, or "none". */
function newNarratedSession(native: NativeRaw | "none" = nativeFor(SCRIPT), script = SCRIPT) {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Timestamps test", script, "en");
  writeArtefactOnce(projectFolder, "voice-over.mp3", MP3);
  let timestampsPath: string | null = null;
  if (native !== "none") {
    timestampsPath = "voice-over.timestamps.json";
    writeArtefactOnce(projectFolder, timestampsPath, typeof native === "string" ? native : JSON.stringify(native));
  }
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath,
    durationSeconds: script.length * STEP,
    sizeBytes: MP3.length,
    nativeTimestampsAvailable: native !== "none",
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  });
  return { runId, projectFolder };
}

function stubAlignment(answer?: (audio: Uint8Array, script: string) => AlignmentResult | Promise<AlignmentResult>) {
  const calls: Array<{ audio: Uint8Array; script: string; attemptsAtCall: number }> = [];
  let runIdForInspection = "";
  const provider: AlignmentProvider = {
    async align(audio, script) {
      calls.push({ audio, script, attemptsAtCall: runIdForInspection ? getStageAttempts(runIdForInspection, "timestamps").length : -1 });
      return answer ? answer(audio, script) : { kind: "success", characters: alignedFor(script) };
    },
  };
  return { provider, calls, inspect: (runId: string) => (runIdForInspection = runId) };
}

const storedFile = (projectFolder: string) =>
  JSON.parse(readFileSync(resolveArtefactPath(projectFolder, "narration-timestamps.json"), "utf8"));

describe("Usable native timestamps are used (AC2)", () => {
  it("stores them with mechanism native, once, in the common format, without calling the alignment provider", async () => {
    const { runId, projectFolder } = newNarratedSession();
    const { provider, calls } = stubAlignment();

    const result = await obtainNarrationTimestamps(runId, provider);

    expect(result).toEqual({ ok: true, mechanism: "native" });
    expect(calls).toHaveLength(0);
    expect(getNarrationTimestamps(runId)).toMatchObject({ mechanism: "native", path: "narration-timestamps.json", characterCount: SCRIPT.length });
    const file = storedFile(projectFolder);
    expect(file.mechanism).toBe("native");
    expect(file.characters).toHaveLength(SCRIPT.length);
    expect(file.characters[0]).toEqual({ text: "H", start: 0, end: STEP });
    expect(file.characters.map((c: { text: string }) => c.text).join("")).toBe(SCRIPT);
  });

  it("records one timestamps attempt for the native mechanism, completed as a success", async () => {
    const { runId } = newNarratedSession();
    await obtainNarrationTimestamps(runId, stubAlignment().provider);
    expect(getStageAttempts(runId, "timestamps")).toMatchObject([{ providerId: "elevenlabs-native", outcome: "success" }]);
  });

  it("leaves the voice-over untouched", async () => {
    const { runId } = newNarratedSession();
    const before = getVoiceOver(runId);
    await obtainNarrationTimestamps(runId, stubAlignment().provider);
    expect(getVoiceOver(runId)).toEqual(before);
  });
});

describe("Forced alignment is used when native timestamps are missing (AC3)", () => {
  it("sends the stored MP3 and the locked script and stores mechanism alignment", async () => {
    const { runId } = newNarratedSession("none");
    const { provider, calls } = stubAlignment();

    const result = await obtainNarrationTimestamps(runId, provider);

    expect(result).toEqual({ ok: true, mechanism: "alignment" });
    expect(calls).toHaveLength(1);
    expect(Buffer.from(calls[0]!.audio).equals(MP3)).toBe(true);
    expect(calls[0]!.script).toBe(SCRIPT);
    expect(getNarrationTimestamps(runId)?.mechanism).toBe("alignment");
    expect(getStageAttempts(runId, "timestamps")).toMatchObject([{ providerId: "elevenlabs-forced-alignment", outcome: "success" }]);
  });

  it("accepts an alignment that differs from the script only in whitespace", async () => {
    const { runId } = newNarratedSession("none");
    const provider = stubAlignment(() => ({ kind: "success", characters: alignedFor(SCRIPT.replace(/ /g, "")) })).provider;
    expect(await obtainNarrationTimestamps(runId, provider)).toEqual({ ok: true, mechanism: "alignment" });
  });

  it("does not need the alignment to start at 0 or to be gapless", async () => {
    const { runId } = newNarratedSession("none");
    const gappy = alignedFor(SCRIPT, 0.1).map((c, i) => ({ ...c, start: c.start + i * 0.01, end: c.end + i * 0.01 }));
    const provider = stubAlignment(() => ({ kind: "success", characters: gappy })).provider;
    expect(await obtainNarrationTimestamps(runId, provider)).toEqual({ ok: true, mechanism: "alignment" });
  });
});

describe("Unusable native timestamps fall back to alignment in the same attempt (AC3)", () => {
  const unusableCases: Array<[string, NativeRaw]> = [
    ["characters that do not reproduce the script", nativeFor("Hi there. Bye NOW.")],
    ["a negative time", (() => { const n = nativeFor(SCRIPT) as any; n.alignment.character_start_times_seconds[3] = -1; return n; })()],
    ["an end beyond the narration", nativeFor(SCRIPT, 1)],
    ["content that is not JSON", "this is not json"],
    ["a shape nobody expects", { hello: "world" }],
  ];

  it.each(unusableCases)("calls the alignment provider when the native timestamps have %s", async (_label, native) => {
    const { runId } = newNarratedSession(native as NativeRaw | "none");
    const { provider, calls } = stubAlignment();

    const result = await obtainNarrationTimestamps(runId, provider);

    expect(result).toEqual({ ok: true, mechanism: "alignment" });
    expect(calls).toHaveLength(1);
    expect(getNarrationTimestamps(runId)?.mechanism).toBe("alignment");
    const attempts = getStageAttempts(runId, "timestamps");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ outcome: "success", errorCode: "native-unusable" });
    expect(attempts[0]?.errorMessage).toBeTruthy();
  });

  it("does not change the voice-over or its MP3", async () => {
    const { runId, projectFolder } = newNarratedSession(nativeFor("Something else entirely."));
    const before = getVoiceOver(runId);
    await obtainNarrationTimestamps(runId, stubAlignment().provider);
    expect(getVoiceOver(runId)).toEqual(before);
    expect(readFileSync(resolveArtefactPath(projectFolder, "voice-over.mp3")).equals(MP3)).toBe(true);
  });
});

describe("Failing to obtain timestamps is a decomposition failure (AC4)", () => {
  const failures: Array<[string, AlignmentResult, boolean, string]> = [
    ["a transient provider failure", { kind: "failed_transient", reason: "the alignment provider answered HTTP 503" }, true, "transient"],
    ["a not-retryable provider failure", { kind: "failed_not_retryable", reason: "the alignment provider answered HTTP 401" }, false, "not-retryable"],
    ["invalid output", { kind: "invalid_output", reason: "the forced-alignment response does not have the expected shape" }, true, "transient"],
    ["alignment that does not reproduce the script", { kind: "success", characters: alignedFor("Something else entirely.") }, true, "transient"],
    ["alignment with a negative time", { kind: "success", characters: alignedFor(SCRIPT).map((c, i) => (i === 2 ? { ...c, start: -1 } : c)) }, true, "transient"],
  ];

  it.each(failures)("records %s: nothing stored, a failed attempt, a decomposition failure", async (_label, answer, retryable, outcome) => {
    const { runId, projectFolder } = newNarratedSession("none");
    const voiceOverBefore = getVoiceOver(runId);

    const result = await obtainNarrationTimestamps(runId, stubAlignment(() => answer).provider);

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
    expect(getNarrationTimestamps(runId)).toBeUndefined();
    expect(existsSync(resolveArtefactPath(projectFolder, "narration-timestamps.json"))).toBe(false);
    expect(getStageAttempts(runId, "timestamps")).toMatchObject([{ outcome }]);
    const failure = getRun(runId)?.failure;
    expect(failure).toMatchObject({ phase: "decomposition", retryable });
    expect(failure?.cause).toMatch(/timestamps/i);
    expect(failure?.cause).toMatch(/script and the narration are unchanged/i);
    expect(getVoiceOver(runId)).toEqual(voiceOverBefore);
  });

  it("never records a voice-over failure, and leaves the voice-over stage's attempts alone", async () => {
    const { runId } = newNarratedSession("none");
    await obtainNarrationTimestamps(runId, stubAlignment(() => ({ kind: "failed_transient", reason: "x" })).provider);
    expect(getRun(runId)?.failure?.phase).not.toBe("voice-over");
    expect(getStageAttempts(runId, "voice-over")).toEqual([]);
  });

  it("fails without a provider call when the stored MP3 is missing", async () => {
    const { runId, projectFolder } = newNarratedSession("none");
    rmSync(resolveArtefactPath(projectFolder, "voice-over.mp3"));
    const { provider, calls } = stubAlignment();

    const result = await obtainNarrationTimestamps(runId, provider);

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
    expect(calls).toHaveLength(0);
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable: false });
  });

  it("clears an earlier decomposition failure once a later attempt succeeds", async () => {
    const { runId } = newNarratedSession("none");
    await obtainNarrationTimestamps(runId, stubAlignment(() => ({ kind: "failed_transient", reason: "x" })).provider);
    expect(getRun(runId)?.failure?.phase).toBe("decomposition");

    await obtainNarrationTimestamps(runId, stubAlignment().provider);

    expect(getRun(runId)?.failure).toBeNull();
    expect(getStageAttempts(runId, "timestamps").map((a) => a.attemptNumber)).toEqual([1, 2]);
  });
});

describe("A retry after unusable native timestamps goes straight to alignment (AC5)", () => {
  it("calls the alignment provider directly, without checking the native timestamps again", async () => {
    const { runId, projectFolder } = newNarratedSession(nativeFor("Something else entirely."));
    await obtainNarrationTimestamps(runId, stubAlignment(() => ({ kind: "failed_transient", reason: "x" })).provider);
    expect(getStageAttempts(runId, "timestamps")[0]?.errorCode).toBe("native-unusable");

    // The native file now looks perfectly usable, yet the finding stands.
    rmSync(resolveArtefactPath(projectFolder, "voice-over.timestamps.json"));
    writeFileSync(resolveArtefactPath(projectFolder, "voice-over.timestamps.json"), JSON.stringify(nativeFor(SCRIPT)));
    const { provider, calls } = stubAlignment();

    const result = await obtainNarrationTimestamps(runId, provider);

    expect(result).toEqual({ ok: true, mechanism: "alignment" });
    expect(calls).toHaveLength(1);
    const attempts = getStageAttempts(runId, "timestamps");
    expect(attempts.map((a) => a.providerId)).toEqual(["elevenlabs-native", "elevenlabs-forced-alignment"]);
    expect(attempts[1]).toMatchObject({ outcome: "success", errorCode: "native-unusable" });
  });

  it("keeps going straight to alignment on every later attempt", async () => {
    const { runId } = newNarratedSession(nativeFor("Something else entirely."));
    const failing = stubAlignment(() => ({ kind: "failed_transient", reason: "x" })).provider;
    await obtainNarrationTimestamps(runId, failing);
    await obtainNarrationTimestamps(runId, failing);
    const { provider, calls } = stubAlignment();
    await obtainNarrationTimestamps(runId, provider);
    expect(calls).toHaveLength(1);
    expect(getStageAttempts(runId, "timestamps").map((a) => a.providerId)).toEqual([
      "elevenlabs-native",
      "elevenlabs-forced-alignment",
      "elevenlabs-forced-alignment",
    ]);
  });

  it("does not skip the native timestamps when they were never judged unusable", async () => {
    const { runId } = newNarratedSession();
    await obtainNarrationTimestamps(runId, stubAlignment(() => ({ kind: "failed_transient", reason: "x" })).provider);
    // Nothing failed on the native side, and the native path stores without a provider, so this succeeded natively.
    expect(getNarrationTimestamps(runId)?.mechanism).toBe("native");
  });
});

describe("Requests that cannot proceed change nothing", () => {
  it("refuses a session without a voice-over and records nothing", async () => {
    const runId = randomUUID();
    createRun(runId, "No narration", SCRIPT, "en");
    const { provider, calls } = stubAlignment();

    expect(await obtainNarrationTimestamps(runId, provider)).toEqual({ ok: false, reason: "no-voice-over" });
    expect(calls).toHaveLength(0);
    expect(getStageAttempts(runId, "timestamps")).toEqual([]);
    expect(getRun(runId)?.failure).toBeNull();
  });

  it("refuses an unknown session", async () => {
    const { provider, calls } = stubAlignment();
    expect(await obtainNarrationTimestamps("no-such-session", provider)).toEqual({ ok: false, reason: "unknown-session" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a session whose timestamps are stored, leaving them and the attempts unchanged", async () => {
    const { runId } = newNarratedSession();
    await obtainNarrationTimestamps(runId, stubAlignment().provider);
    const before = { record: getNarrationTimestamps(runId), attempts: getStageAttempts(runId, "timestamps") };

    const { provider, calls } = stubAlignment();
    expect(await obtainNarrationTimestamps(runId, provider)).toEqual({ ok: false, reason: "already-obtained" });

    expect(calls).toHaveLength(0);
    expect({ record: getNarrationTimestamps(runId), attempts: getStageAttempts(runId, "timestamps") }).toEqual(before);
  });

  it("keeps each session's timestamps apart", async () => {
    const a = newNarratedSession();
    const b = newNarratedSession("none");
    await obtainNarrationTimestamps(a.runId, stubAlignment().provider);
    expect(getNarrationTimestamps(b.runId)).toBeUndefined();
    expect(getStageAttempts(b.runId, "timestamps")).toEqual([]);
  });
});

describe("The attempt is recorded before any provider call", () => {
  it("has an in-flight timestamps attempt when the alignment provider is called", async () => {
    const { runId } = newNarratedSession("none");
    const { provider, calls, inspect } = stubAlignment();
    inspect(runId);

    await obtainNarrationTimestamps(runId, provider);

    expect(calls[0]?.attemptsAtCall).toBe(1);
  });
});

describe("Recovering from a crash between writing the file and the record", () => {
  it("adopts a stored, valid timestamps file that has no record", async () => {
    const { runId, projectFolder } = newNarratedSession("none");
    const characters = alignedFor(SCRIPT);
    writeArtefactOnce(projectFolder, "narration-timestamps.json", JSON.stringify({ mechanism: "alignment", characters }));
    const { provider, calls } = stubAlignment();

    const result = await obtainNarrationTimestamps(runId, provider);

    expect(result).toEqual({ ok: true, mechanism: "alignment" });
    expect(calls).toHaveLength(0);
    expect(getNarrationTimestamps(runId)).toMatchObject({ mechanism: "alignment", characterCount: SCRIPT.length });
  });

  it("records a decomposition failure when the leftover file is not usable", async () => {
    const { runId, projectFolder } = newNarratedSession("none");
    writeArtefactOnce(projectFolder, "narration-timestamps.json", "garbage");

    const result = await obtainNarrationTimestamps(runId, stubAlignment().provider);

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
    expect(getNarrationTimestamps(runId)).toBeUndefined();
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", retryable: false });
  });
});

describe("A leftover file that parses but does not fit the script", () => {
  it("is reported as a decomposition failure, not adopted", async () => {
    const { runId, projectFolder } = newNarratedSession("none");
    writeArtefactOnce(
      projectFolder,
      "narration-timestamps.json",
      JSON.stringify({ mechanism: "alignment", characters: alignedFor("Something else entirely.") }),
    );

    const result = await obtainNarrationTimestamps(runId, stubAlignment().provider);

    expect(result).toMatchObject({ ok: false, reason: "decomposition-failed" });
    expect(getNarrationTimestamps(runId)).toBeUndefined();
    expect(getRun(runId)?.failure?.cause).toMatch(/not usable/);
  });
});

describe("clearRunFailure", () => {
  it("removes a stored failure and is a no-op without one", () => {
    const runId = randomUUID();
    createRun(runId, "Failure test", SCRIPT, "en");
    clearRunFailure(runId);
    expect(getRun(runId)?.failure).toBeNull();
    setRunFailure(runId, createDecompositionFailure({ cause: "x", retryable: true, occurredAt: new Date() }));
    clearRunFailure(runId);
    expect(getRun(runId)?.failure).toBeNull();
  });
});
