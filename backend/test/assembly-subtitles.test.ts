import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createRun, getRun, insertNarrationTimestamps, insertVoiceOver, setScenePauseEdit, writeArtefactOnce } from "../src/db.ts";
import { buildAssemblySubtitles } from "../src/assemblySubtitles.ts";
import { rebuildFinalVideo } from "../src/finalVideoRebuild.ts";
import { SCRIPT, finishedSession, resetRebuildEnvironment, waitFor } from "./rebuildFixtures.ts";

// add-burned-in-subtitles (JOS-237), group 4 — design Decision 3: the orchestrator builds the cues from the stored
// timestamps and the pause edits, and hands them to the assembly tool; it never fails the attempt itself.

beforeEach(resetRebuildEnvironment);

/** A run with a voice-over and the given stored characters (what `finishedSession` does, but with characters of the test's choosing). */
function runWithStoredCharacters(script: string, stored: string | null): string {
  const runId = randomUUID();
  createRun(runId, "Subtitle test", script, "en");
  const run = getRun(runId)!;
  const audio = writeArtefactOnce(run.projectFolder, "voice-over.mp3", Buffer.from("fake-mp3-bytes"));
  insertVoiceOver({
    runId,
    audioPath: audio,
    timestampsPath: null,
    durationSeconds: 10,
    sizeBytes: 14,
    nativeTimestampsAvailable: false,
    providerRequestId: "fake",
    completedAt: new Date().toISOString(),
  });
  if (stored !== null) {
    const path = writeArtefactOnce(run.projectFolder, "narration-timestamps.json", stored);
    insertNarrationTimestamps({ runId, mechanism: "alignment", path, characterCount: 1, obtainedAt: new Date().toISOString() });
  }
  return runId;
}

const charactersOf = (text: string): Array<{ text: string; start: number; end: number }> =>
  [...text].map((character, index) => ({ text: character, start: index * 0.1, end: (index + 1) * 0.1 }));

describe("buildAssemblySubtitles", () => {
  it("builds the cues from the stored timestamps", () => {
    const runId = runWithStoredCharacters("Scene 1.", JSON.stringify({ mechanism: "alignment", characters: charactersOf("Scene1.") }));

    const cues = buildAssemblySubtitles(runId, [], 10);

    expect(cues).toHaveLength(1);
    expect(cues![0]!.words.map((word) => word.text)).toEqual(["Scene", "1."]);
  });

  it("returns null when the session has no stored timestamps", () => {
    expect(buildAssemblySubtitles(runWithStoredCharacters("Scene 1.", null), [], 10)).toBeNull();
  });

  it("returns null when the stored file cannot be read", () => {
    expect(buildAssemblySubtitles(runWithStoredCharacters("Scene 1.", "not json"), [], 10)).toBeNull();
    expect(buildAssemblySubtitles(runWithStoredCharacters("Scene 1.", JSON.stringify({ characters: "nope" })), [], 10)).toBeNull();
  });

  it("returns null when the stored characters do not match the script", () => {
    const runId = runWithStoredCharacters("Scene 1.", JSON.stringify({ mechanism: "alignment", characters: charactersOf("Other.") }));

    expect(buildAssemblySubtitles(runId, [], 10)).toBeNull();
  });

  it("returns null for a run that does not exist", () => {
    expect(buildAssemblySubtitles(randomUUID(), [], 10)).toBeNull();
  });
});

describe("the assembly phase passes the cues to the tool (design Decision 3)", () => {
  it("gives the first assembly cues timed from the stored timestamps", async () => {
    const { calls } = await finishedSession();

    const subtitles = calls[0]!.subtitles!;
    expect(subtitles).toHaveLength(2);
    expect(subtitles[0]!.words.map((word) => [word.text, word.startSeconds])).toEqual([["Scene", 0], ["1.", expect.closeTo(0.5, 6)]]);
    expect(subtitles[1]!.words.map((word) => [word.text, word.startSeconds])).toEqual([["Scene", expect.closeTo(5, 6)], ["2.", expect.closeTo(5.5, 6)]]);
    expect(subtitles[0]!.endSeconds).toBeCloseTo(1.2, 6); // last character at 0.7 s, plus 0.5 s
    expect(subtitles[1]!.endSeconds).toBeCloseTo(6.2, 6);
  });

  it("gives a rebuild the cues moved by the same pause edit as the narration", async () => {
    const { runId, sceneIds, calls } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3); // scene 1's pause: 4.3 s -> 3.3 s, 1 s removed around 2.85 s

    rebuildFinalVideo(runId);
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");

    const subtitles = calls.at(-1)!.subtitles!;
    expect(subtitles[0]!.startSeconds).toBeCloseTo(0, 6); // before the edit: unchanged
    expect(subtitles[1]!.startSeconds).toBeCloseTo(4, 6); // was 5
    expect(subtitles[1]!.words.map((word) => word.startSeconds)).toEqual([expect.closeTo(4, 6), expect.closeTo(4.5, 6)]);
    expect(subtitles[1]!.endSeconds).toBeCloseTo(5.2, 6); // was 6.2
  });

  it("passes null when the session has no stored timestamps, and lets the tool decide", async () => {
    const { calls } = await finishedSession({ timestamps: false });

    expect(calls[0]!.subtitles).toBeNull();
  });

  it("keeps the script out of the session's recorded failure when the tool refuses", async () => {
    const { runId } = await finishedSession({ timestamps: false });

    expect(JSON.stringify(getRun(runId)?.failure ?? null)).not.toContain(SCRIPT);
  });
});
