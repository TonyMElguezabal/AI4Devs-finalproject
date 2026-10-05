import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ArtefactAlreadyExistsError,
  countScenesForRun,
  getRun,
  getStageAttempts,
  getVoiceOver,
  insertVoiceOver,
  setRunFailure,
  startVoiceAttempt,
  writeArtefactOnce,
} from "./db.ts";
import { VOICE_PROVIDER } from "./config/providers.ts";
import { admitLaunch, registerStageLauncher, type StageLauncher } from "./launchGate.ts";
import { broadcast } from "./orchestrator.ts";
import { recordAttemptOutcome, type RecordedOutcome } from "./retry/stageAttemptRecorder.ts";
import { registerTimeoutHandler } from "./retry/attemptTimeoutWatcher.ts";
import { hasScheduledAttempt, registerAttemptSender, releaseSessionAttempts } from "./retry/retryScheduler.ts";
import { createVoiceOverFailure } from "./sessionStateMachine.ts";
import { getVoiceProviderRegistry, type VoiceSynthesisResult } from "./voiceProvider.ts";
import { canLaunchVoiceOver } from "./voiceLaunchGuard.ts";
import type { StageAttempt, VoiceOver } from "./types.ts";

// generate-voice-over (JOS-136) — PRD §5 step 2, §10.1, §10.3, §11.2: one
// request with the whole stored script, one MP3 kept for good, whatever the
// provider returned beside it kept raw, and a failure reported on the session.
// The session's state is never stored: the in-flight attempt, the voice-over
// record and the failure say it (Decision 12).

export const AUDIO_FILE = "voice-over.mp3";
export const NATIVE_TIMESTAMPS_FILE = "voice-over-timestamps.json";
const INVALID_AUDIO = "invalid-audio";
const PROBE_UNAVAILABLE = "probe-unavailable";

const execFileAsync = promisify(execFile);

export type SuccessResult = Extract<VoiceSynthesisResult, { kind: "success" }>;

export interface VoiceOverLogEntry {
  event: string;
  sessionId: string;
  stage: "voice-over";
  provider?: string;
  attemptNumber?: number;
  providerRequestId?: string;
  outcome?: string;
  latencyMs?: number;
  scriptLength?: number;
  scriptSha256?: string;
  reason?: string;
  stageInstanceKey?: string;
  cycle?: number;
  sequenceInCycle?: number;
  trigger?: string;
  /** Time from the attempt being queued (or scheduled) to it being sent. */
  queuedMs?: number;
}

export interface VoiceOverLogger {
  info(entry: VoiceOverLogEntry, message?: string): void;
  warn(entry: VoiceOverLogEntry, message?: string): void;
}

let logger: VoiceOverLogger = { info: () => {}, warn: () => {} };

/** bounded-retry-policy (JOS-184) — the fields every attempt log carries, so one stage instance's attempts can be followed. */
function attemptFields(attempt: StageAttempt, sentAt: Date): Pick<VoiceOverLogEntry, "stageInstanceKey" | "cycle" | "sequenceInCycle" | "trigger" | "queuedMs"> {
  return {
    stageInstanceKey: attempt.stageInstanceKey,
    cycle: attempt.cycle,
    sequenceInCycle: attempt.sequenceInCycle,
    trigger: attempt.trigger,
    queuedMs: Math.max(0, sentAt.getTime() - Date.parse(attempt.queuedAt)),
  };
}

export function setVoiceOverLogger(next: VoiceOverLogger): void {
  logger = next;
}

export type VoiceOverOutcome =
  | { ok: true }
  | { ok: false; reason: "unknown-session" | "narration-complete" | "already-in-flight" | "failed" | "retry-scheduled" };

export type ConfirmOutcome =
  | { stored: true; voiceOver: VoiceOver }
  | { stored: false; reason: "already-stored" }
  | { stored: false; reason: "invalid-audio" | "probe-unavailable" | "storage-failed"; detail: string };

/** Decision 7 — measures the audio with ffprobe; it must be an MP3 with a duration above zero. */
async function probeAudio(audio: Uint8Array): Promise<{ ok: true; durationSeconds: number } | { ok: false; unavailable: boolean; detail: string }> {
  if (audio.byteLength === 0) return { ok: false, unavailable: false, detail: "the provider returned an empty file" };
  const folder = mkdtempSync(join(tmpdir(), "vid4you-probe-"));
  try {
    const file = join(folder, "audio");
    writeFileSync(file, audio);
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=format_name,duration", "-of", "json", file]));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ok: false, unavailable: true, detail: "ffprobe is not installed, so the audio could not be checked" };
      }
      return { ok: false, unavailable: false, detail: "the returned audio could not be decoded as an MP3" };
    }
    const format = (JSON.parse(stdout) as { format?: { format_name?: string; duration?: string } }).format;
    const duration = Number(format?.duration);
    if (!format?.format_name?.split(",").includes("mp3")) return { ok: false, unavailable: false, detail: "the returned audio is not an MP3" };
    if (!Number.isFinite(duration) || duration <= 0) return { ok: false, unavailable: false, detail: "the returned audio has no duration" };
    return { ok: true, durationSeconds: duration };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * Decisions 6-8 — checks the audio, writes the MP3 (and the raw timestamps)
 * once, then records the voice-over. The store's uniqueness decides a repeated
 * or concurrent confirmation, so a second one is "already stored" and writes
 * nothing. Launches nothing: the next phase is not this story's.
 */
export async function confirmVoiceOver(
  runId: string,
  result: SuccessResult,
  now: () => Date = () => new Date(),
): Promise<ConfirmOutcome> {
  const run = getRun(runId);
  if (!run) return { stored: false, reason: "storage-failed", detail: "the session does not exist" };
  if (getVoiceOver(runId)) return { stored: false, reason: "already-stored" };

  const probe = await probeAudio(result.audio);
  if (!probe.ok) return { stored: false, reason: probe.unavailable ? "probe-unavailable" : "invalid-audio", detail: probe.detail };

  const hasTimestamps = result.nativeTimestamps !== undefined;
  try {
    writeArtefactOnce(run.projectFolder, AUDIO_FILE, Buffer.from(result.audio));
    if (hasTimestamps) writeArtefactOnce(run.projectFolder, NATIVE_TIMESTAMPS_FILE, JSON.stringify(result.nativeTimestamps));
    const voiceOver: VoiceOver = {
      runId,
      audioPath: AUDIO_FILE,
      timestampsPath: hasTimestamps ? NATIVE_TIMESTAMPS_FILE : null,
      durationSeconds: probe.durationSeconds,
      sizeBytes: result.audio.byteLength,
      nativeTimestampsAvailable: hasTimestamps,
      providerRequestId: result.providerRequestId ?? null,
      completedAt: now().toISOString(),
    };
    return insertVoiceOver(voiceOver) ? { stored: true, voiceOver } : { stored: false, reason: "already-stored" };
  } catch (err) {
    if (err instanceof ArtefactAlreadyExistsError) {
      if (getVoiceOver(runId)) return { stored: false, reason: "already-stored" };
      return { stored: false, reason: "storage-failed", detail: "a narration file already exists for this session without a record" };
    }
    return { stored: false, reason: "storage-failed", detail: "the narration could not be written to the project folder" };
  }
}

function scriptFingerprint(script: string): { scriptLength: number; scriptSha256: string } {
  return { scriptLength: script.length, scriptSha256: createHash("sha256").update(script).digest("hex") };
}

/**
 * The voice phase for one session: guard, persist the state change and the
 * in-flight attempt, send once, record the outcome. Registration and the held
 * launch on continue come through here for the first attempt; every later
 * attempt (automatic or manual retry) is a scheduled attempt that the retry
 * scheduler claims and hands to `sendVoiceAttempt`.
 */
export async function generateVoiceOver(runId: string, now: () => Date = () => new Date()): Promise<VoiceOverOutcome> {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown-session" };
  if (!canLaunchVoiceOver(runId).allowed) return { ok: false, reason: "narration-complete" };
  if (getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "in-flight" || attempt.outcome === "scheduled")) {
    return { ok: false, reason: "already-in-flight" };
  }

  // Decision 3 — the binding wins over whatever the build's default is today.
  const providerId = run.voiceProviderId ?? getVoiceProviderRegistry().defaultIdentifier;
  const startedAt = now();
  const attempt = startVoiceAttempt({ runId, providerId, queuedAt: startedAt.toISOString(), sentAt: startedAt.toISOString() });
  return sendVoiceAttempt(attempt, now);
}

/** What a recorded failure (a failed call or a timeout) does to the session: log exhaustion, set the failure, publish the state. */
function reportRecordedFailure(
  attempt: StageAttempt,
  recorded: RecordedOutcome,
  outcome: string,
  detail: string,
  providerId: string,
  occurredAt: Date,
  startedAt: Date,
): void {
  if (recorded.action === "failed") {
    logger.warn(
      {
        event: recorded.retryable ? "voice-over.retries.exhausted" : "voice-over.failure.not-retryable",
        sessionId: attempt.runId,
        stage: "voice-over",
        provider: providerId,
        outcome,
        reason: detail,
        ...attemptFields(attempt, startedAt),
      },
      recorded.retryable ? "the voice-over cycle used all its attempts" : "the voice-over failed and cannot be retried",
    );
    setRunFailure(
      attempt.runId,
      createVoiceOverFailure({
        cause: `The voice-over could not be generated: ${detail}. The script is unchanged.`,
        retryable: recorded.retryable,
        occurredAt,
        cycle: recorded.cycle,
        attemptsInCycle: recorded.attemptsInCycle,
      }),
    );
  }
  broadcast(attempt.runId);
}

// stage-execution-time-limit (JOS-185) — the voice provider's call has no limit of its own, so the watcher
// is what ends a hung attempt. The recorder has already scheduled the next attempt or declared exhaustion.
registerTimeoutHandler("voice-over", (attempt, recorded, { now, limitSeconds }) => {
  const detail = `the voice provider had no result after ${limitSeconds} s`;
  const sentAt = new Date(attempt.sentAt ?? attempt.queuedAt);
  const providerId = attempt.providerId ?? "unknown";
  logger.warn(
    {
      event: "voice-over.attempt.timed-out",
      sessionId: attempt.runId,
      stage: "voice-over",
      provider: providerId,
      attemptNumber: attempt.attemptNumber,
      outcome: "timed-out",
      latencyMs: now.getTime() - sentAt.getTime(),
      reason: detail,
      ...attemptFields(attempt, sentAt),
    },
    "a voice-over attempt outlasted its maximum time",
  );
  reportRecordedFailure(attempt, recorded, "timed-out", detail, providerId, now, sentAt);
});

/** Sends one in-flight voice attempt (the first, or a claimed retry) and reports its classified outcome to the recorder. */
export async function sendVoiceAttempt(attempt: StageAttempt, now: () => Date = () => new Date()): Promise<VoiceOverOutcome> {
  const runId = attempt.runId;
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown-session" };
  const registry = getVoiceProviderRegistry();
  const providerId = attempt.providerId ?? run.voiceProviderId ?? registry.defaultIdentifier;
  const startedAt = now();
  const fingerprint = scriptFingerprint(run.script);

  if (!canLaunchVoiceOver(runId).allowed) {
    recordAttemptOutcome(attempt.id, { outcome: "success" }, { now });
    return { ok: false, reason: "narration-complete" };
  }
  logger.info({ event: "voice-over.attempt.started", sessionId: runId, stage: "voice-over", provider: providerId, attemptNumber: attempt.attemptNumber, ...attemptFields(attempt, startedAt), ...fingerprint });
  broadcast(runId);

  const finishFailure = (
    outcome: "transient" | "not-retryable",
    detail: string,
    errorCode?: string,
    providerRequestId?: string,
  ): VoiceOverOutcome => {
    const occurredAt = now();
    const recorded = recordAttemptOutcome(
      attempt.id,
      { outcome, errorMessage: detail, ...(errorCode ? { errorCode } : {}), ...(providerRequestId ? { externalRequestId: providerRequestId } : {}) },
      { now },
    );
    logger.info({
      event: "voice-over.attempt.finished",
      sessionId: runId,
      stage: "voice-over",
      provider: providerId,
      attemptNumber: attempt.attemptNumber,
      outcome,
      latencyMs: occurredAt.getTime() - startedAt.getTime(),
      reason: detail,
      ...(providerRequestId ? { providerRequestId } : {}),
      ...attemptFields(attempt, startedAt),
      ...fingerprint,
    });
    reportRecordedFailure(attempt, recorded, outcome, detail, providerId, occurredAt, startedAt);
    return { ok: false, reason: recorded.action === "scheduled" ? "retry-scheduled" : "failed" };
  };

  const adapter = registry.adapters[providerId];
  if (!adapter) {
    return finishFailure("not-retryable", `the voice provider '${providerId}' bound to this session is not available`);
  }

  let result: VoiceSynthesisResult;
  try {
    result = await adapter.synthesize({
      text: run.script,
      language: run.language,
      voiceId: VOICE_PROVIDER.voiceId,
      model: VOICE_PROVIDER.model,
      outputFormat: VOICE_PROVIDER.outputFormat,
      speed: VOICE_PROVIDER.speed,
    });
  } catch {
    return finishFailure("transient", "the voice provider call failed unexpectedly");
  }

  if (result.kind !== "success") {
    return finishFailure(result.kind === "failed_transient" ? "transient" : "not-retryable", result.reason);
  }

  const confirmed = await confirmVoiceOver(runId, result, now);
  if (confirmed.stored) {
    const finishedAt = now();
    recordAttemptOutcome(attempt.id, { outcome: "success", ...(result.providerRequestId ? { externalRequestId: result.providerRequestId } : {}) }, { now });
    logger.info({
      event: "voice-over.attempt.finished",
      sessionId: runId,
      stage: "voice-over",
      provider: providerId,
      attemptNumber: attempt.attemptNumber,
      outcome: "success",
      latencyMs: finishedAt.getTime() - startedAt.getTime(),
      ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...attemptFields(attempt, startedAt),
      ...fingerprint,
    });
    broadcast(runId);
    return { ok: true };
  }
  if (confirmed.reason === "already-stored") {
    recordAttemptOutcome(attempt.id, { outcome: "success" }, { now });
    return { ok: false, reason: "narration-complete" };
  }
  if (confirmed.reason === "invalid-audio") return finishFailure("transient", confirmed.detail, INVALID_AUDIO, result.providerRequestId);
  if (confirmed.reason === "probe-unavailable") return finishFailure("not-retryable", confirmed.detail, PROBE_UNAVAILABLE, result.providerRequestId);
  return finishFailure("not-retryable", confirmed.detail, undefined, result.providerRequestId);
}

registerAttemptSender("voice-over", (attempt) => {
  sendVoiceAttempt(attempt).catch((err: unknown) => {
    logger.info({ event: "voice-over.launch.error", sessionId: attempt.runId, stage: "voice-over", reason: err instanceof Error ? err.name : "unknown" });
  });
});

function launchInBackground(sessionId: string): void {
  generateVoiceOver(sessionId).catch((err: unknown) => {
    logger.info({ event: "voice-over.launch.error", sessionId, stage: "voice-over", reason: err instanceof Error ? err.name : "unknown" });
  });
}

/**
 * Decision 1 and the pause rule (§9) — the stage's entry in the phase-launch
 * gate. A session is waiting for its voice-over when it has no chunks (a
 * session with chunks necessarily had one), no voice-over, no failure and no
 * attempt in flight.
 */
export const voiceOverLauncher: StageLauncher = {
  stage: "voice-over",
  heldWork: (sessionId: string) => {
    const waiting =
      getRun(sessionId)?.failure === null &&
      canLaunchVoiceOver(sessionId).allowed &&
      countScenesForRun(sessionId) === 0 &&
      !getStageAttempts(sessionId, "voice-over").some((attempt) => attempt.outcome === "in-flight");
    return { count: waiting ? 1 : 0, sceneIds: [] };
  },
  launch: (sessionId: string) => {
    if (!admitLaunch(sessionId).admitted) return;
    if (hasScheduledAttempt(sessionId)) {
      releaseSessionAttempts(sessionId);
      return;
    }
    launchInBackground(sessionId);
  },
};

registerStageLauncher(voiceOverLauncher);

/** Task 5.16 — a committed `submitted` session is handed to the gate. */
export function launchVoiceOverFor(sessionId: string): void {
  voiceOverLauncher.launch(sessionId);
}
