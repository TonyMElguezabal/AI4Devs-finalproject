import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { AlignmentProvider } from "./alignmentProvider.ts";
import {
  clearRunFailure,
  completeStageAttempt,
  getNarrationTimestamps,
  getRun,
  getStageAttempts,
  getVoiceOver,
  insertNarrationTimestamps,
  recordStageAttempt,
  resolveArtefactPath,
  setRunFailure,
  writeArtefactOnce,
} from "./db.ts";
import {
  checkTimestamps,
  parseNativeTimestamps,
  type TimestampCharacter,
  type UsabilityResult,
} from "./narrationTimestamps.ts";
import { broadcast } from "./orchestrator.ts";
import { createDecompositionFailure } from "./sessionStateMachine.ts";
import type { DecompositionFailure, Run, TimestampMechanism, VoiceOver } from "./types.ts";

// obtain-narration-timestamps (JOS-139) — PRD §5 step 3, §10.3, §11.1: where
// each character of the script sits in the narration. Native timestamps first;
// forced alignment when they are missing or unusable, in the same attempt; a
// failure is a decomposition failure, never a voice failure.
//
// The voice provider is not a dependency of this module, so it cannot be called
// again and the MP3 cannot be regenerated (design Decisions 1 and 4). Nothing in
// the running app calls it yet: JOS-136's voice phase calls it once a narration
// completes.

export const STORED_FILE = "narration-timestamps.json";
const NATIVE_PROVIDER = "elevenlabs-native";
const ALIGNMENT_PROVIDER = "elevenlabs-forced-alignment";
/** Recorded on an attempt's `error_code` once native timestamps were judged unusable (Decision 5). */
const NATIVE_UNUSABLE = "native-unusable";

export type ObtainResult =
  | { ok: true; mechanism: TimestampMechanism }
  | { ok: false; reason: "unknown-session" | "no-voice-over" | "already-obtained" }
  | { ok: false; reason: "decomposition-failed"; failure: DecompositionFailure };

export const storedFileSchema = z.object({
  mechanism: z.enum(["native", "alignment"]),
  characters: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
});

function readJson(projectFolder: string, relativePath: string): unknown {
  return JSON.parse(readFileSync(resolveArtefactPath(projectFolder, relativePath), "utf8"));
}

/** Decision 3 — reads the voice provider's raw file and checks it exactly against the script. */
function checkNativeFile(
  run: Run,
  voiceOver: VoiceOver,
  timestampsPath: string,
): { usable: true; characters: TimestampCharacter[] } | { usable: false; reason: string } {
  let raw: unknown;
  try {
    raw = readJson(run.projectFolder, timestampsPath);
  } catch {
    return { usable: false, reason: "the native timestamps file could not be read as JSON" };
  }
  const parsed = parseNativeTimestamps(raw);
  if (!parsed.ok) return { usable: false, reason: parsed.reason };
  const check = checkTimestamps(parsed.characters, run.script, voiceOver.durationSeconds, "exact");
  return check.usable ? { usable: true, characters: parsed.characters } : { usable: false, reason: check.reason };
}

/** Decision 7 — the normalised file first, then its record, so a stored record always has its file. */
function storeTimestamps(run: Run, mechanism: TimestampMechanism, characters: TimestampCharacter[], obtainedAt: string): boolean {
  writeArtefactOnce(run.projectFolder, STORED_FILE, JSON.stringify({ mechanism, characters }));
  return insertNarrationTimestamps({ runId: run.id, mechanism, path: STORED_FILE, characterCount: characters.length, obtainedAt });
}

/**
 * A crash between writing the file and inserting its record leaves a file that
 * can never be written again. If it is a valid stored file for this session, it
 * is adopted; otherwise it is reported.
 */
function checkLeftoverFile(
  run: Run,
  voiceOver: VoiceOver,
): { present: false } | { present: true; usable: true; mechanism: TimestampMechanism; characters: TimestampCharacter[] } | { present: true; usable: false; reason: string } {
  if (!existsSync(resolveArtefactPath(run.projectFolder, STORED_FILE))) return { present: false };
  let parsed: z.SafeParseReturnType<unknown, z.infer<typeof storedFileSchema>>;
  try {
    parsed = storedFileSchema.safeParse(readJson(run.projectFolder, STORED_FILE));
  } catch {
    return { present: true, usable: false, reason: "a stored timestamps file exists without a record and cannot be read" };
  }
  if (!parsed.success) return { present: true, usable: false, reason: "a stored timestamps file exists without a record and has an unexpected shape" };
  const check: UsabilityResult = checkTimestamps(
    parsed.data.characters,
    run.script,
    voiceOver.durationSeconds,
    parsed.data.mechanism === "native" ? "exact" : "ignore-whitespace",
  );
  return check.usable
    ? { present: true, usable: true, mechanism: parsed.data.mechanism, characters: parsed.data.characters }
    : { present: true, usable: false, reason: `a stored timestamps file exists without a record and is not usable: ${check.reason}` };
}

export async function obtainNarrationTimestamps(
  runId: string,
  alignmentProvider: AlignmentProvider,
  now: () => Date = () => new Date(),
): Promise<ObtainResult> {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown-session" };
  const voiceOver = getVoiceOver(runId);
  if (!voiceOver) return { ok: false, reason: "no-voice-over" };
  if (getNarrationTimestamps(runId)) return { ok: false, reason: "already-obtained" };

  // Decision 5 — once native timestamps were judged unusable, every later attempt goes straight to alignment.
  const nativeAlreadyUnusable = getStageAttempts(runId, "timestamps").some((attempt) => attempt.errorCode === NATIVE_UNUSABLE);
  const nativePath = voiceOver.nativeTimestampsAvailable && !nativeAlreadyUnusable ? voiceOver.timestampsPath : null;

  // Decision 2 — recorded in flight before anything is read or sent.
  const startedAt = now().toISOString();
  const attempt = recordStageAttempt({
    runId,
    stage: "timestamps",
    providerId: nativePath ? NATIVE_PROVIDER : ALIGNMENT_PROVIDER,
    queuedAt: startedAt,
    sentAt: startedAt,
  });

  let nativeFinding: string | null = nativeAlreadyUnusable ? "native timestamps were already judged unusable" : null;

  const succeed = (mechanism: TimestampMechanism): ObtainResult => {
    completeStageAttempt(attempt.id, {
      outcome: "success",
      finishedAt: now().toISOString(),
      ...(nativeFinding ? { errorCode: NATIVE_UNUSABLE, errorMessage: nativeFinding } : {}),
    });
    clearRunFailure(runId);
    broadcast(runId);
    return { ok: true, mechanism };
  };

  /** Decision 8 — completes the attempt as failed and records a decomposition failure (never a voice failure). */
  const fail = (detail: string, retryable: boolean): ObtainResult => {
    const occurredAt = now();
    completeStageAttempt(attempt.id, {
      outcome: retryable ? "transient" : "not-retryable",
      finishedAt: occurredAt.toISOString(),
      ...(nativeFinding ? { errorCode: NATIVE_UNUSABLE } : {}),
      errorMessage: nativeFinding && !nativeAlreadyUnusable ? `${nativeFinding}; ${detail}` : detail,
    });
    const failure = createDecompositionFailure({
      cause: `The narration's timestamps could not be obtained: ${detail}. The script and the narration are unchanged.`,
      retryable,
      occurredAt,
    });
    setRunFailure(runId, failure);
    broadcast(runId);
    return { ok: false, reason: "decomposition-failed", failure };
  };

  const stored = (mechanism: TimestampMechanism, characters: TimestampCharacter[]): ObtainResult =>
    storeTimestamps(run, mechanism, characters, now().toISOString()) ? succeed(mechanism) : { ok: false, reason: "already-obtained" };

  const leftover = checkLeftoverFile(run, voiceOver);
  if (leftover.present) {
    if (!leftover.usable) return fail(leftover.reason, false);
    const adopted = insertNarrationTimestamps({
      runId,
      mechanism: leftover.mechanism,
      path: STORED_FILE,
      characterCount: leftover.characters.length,
      obtainedAt: now().toISOString(),
    });
    return adopted ? succeed(leftover.mechanism) : { ok: false, reason: "already-obtained" };
  }

  if (nativePath) {
    const native = checkNativeFile(run, voiceOver, nativePath);
    if (native.usable) return stored("native", native.characters);
    nativeFinding = `native timestamps unusable: ${native.reason}`;
  }

  let audio: Buffer;
  try {
    audio = readFileSync(resolveArtefactPath(run.projectFolder, voiceOver.audioPath));
  } catch {
    return fail("the stored narration file could not be read", false);
  }

  const aligned = await alignmentProvider.align(audio, run.script);
  if (aligned.kind === "failed_not_retryable") return fail(aligned.reason, false);
  if (aligned.kind === "failed_transient" || aligned.kind === "invalid_output") return fail(aligned.reason, true);

  const check = checkTimestamps(aligned.characters, run.script, voiceOver.durationSeconds, "ignore-whitespace");
  if (!check.usable) return fail(`the alignment provider's timestamps are not usable: ${check.reason}`, true);
  return stored("alignment", aligned.characters);
}
