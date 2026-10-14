import { randomUUID } from "node:crypto";
import { createRun, insertVoiceOver, writeArtefactOnce } from "../src/db.ts";

// run-session-end-to-end (JOS-195) — a session whose narration is stored and nothing else of the decomposition phase,
// built through the store the way the decomposition tests do. Native timestamps are unavailable, so alignment obtains them.

export const NARRATED_STEP_SECONDS = 0.25;
export const NARRATED_SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);

export function narratedSession(title = "Hand-off test"): string {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, title, NARRATED_SCRIPT, "en");
  writeArtefactOnce(projectFolder, "voice-over.mp3", MP3);
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: null,
    durationSeconds: NARRATED_SCRIPT.length * NARRATED_STEP_SECONDS,
    sizeBytes: MP3.length,
    nativeTimestampsAvailable: false,
    providerRequestId: "req-1",
    completedAt: "2026-10-13T10:00:00.000Z",
  });
  return runId;
}
