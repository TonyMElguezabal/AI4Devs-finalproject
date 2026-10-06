import { getRun } from "./db.ts";

// pause-and-continue-session (JOS-152) — the single gate every provider
// launch asks before sending. Design Decisions 1, 3, 10.

export type PipelineStage = "voice-over" | "decomposition" | "image" | "video" | "assembly";

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  "voice-over",
  "decomposition",
  "image",
  "video",
  "assembly",
];

// Stages for which no launcher is registered yet. A story that adds a launcher
// removes its stage from this list in the same change. Reviewers can see which
// stages still lack resume-on-continue support.
const defaultNotYetLaunchable: readonly PipelineStage[] = [
  "voice-over",
  "decomposition",
  "image",
  "video",
  "assembly",
];

export const NOT_YET_LAUNCHABLE = new Set<PipelineStage>(defaultNotYetLaunchable);

export interface HeldWorkResult {
  count: number;
  sceneIds: readonly string[];
}

/** The cause every attempt settled at boot records (restart-recovery). */
export const RESTART_CAUSE = "interrupted by a restart";

/** What a stage's boot settle did with its in-flight units (restart-recovery, JOS-160). */
export interface SettleSummary {
  /** Results found and applied, or requests the provider still holds that were awaited again. */
  resumed: number;
  /** Attempts completed as failed because the provider no longer holds the request. */
  recordedFailedAttempt: number;
  /** Requests still pending at the provider that will be delivered later. */
  stillPending: number;
}

export interface StageLauncher {
  stage: PipelineStage;
  heldWork: (sessionId: string) => HeldWorkResult;
  /** Boot pass 2 only: the pending work to relaunch when it is narrower than `heldWork` (a spent retry budget must stay spent). */
  pendingAtBoot?: (sessionId: string) => HeldWorkResult;
  launch: (sessionId: string) => void;
  /** Boot, before anything is relaunched: waits for or fails each in-flight unit of this stage. Never launches new work. */
  settleInFlight: () => SettleSummary;
}

const launchers = new Map<PipelineStage, StageLauncher>();

export function registerStageLauncher(launcher: StageLauncher): void {
  if (launchers.has(launcher.stage)) {
    throw new Error(`stage '${launcher.stage}' already has a registered launcher`);
  }
  launchers.set(launcher.stage, launcher);
  NOT_YET_LAUNCHABLE.delete(launcher.stage);
}

export type AdmitLaunchResult =
  | { admitted: true }
  | { admitted: false; reason: "session-paused" | "unknown-session" };

export function admitLaunch(sessionId: string): AdmitLaunchResult {
  const run = getRun(sessionId);
  if (!run) return { admitted: false, reason: "unknown-session" };
  if (run.paused) return { admitted: false, reason: "session-paused" };
  return { admitted: true };
}

export interface SessionHeldWork {
  stages: ReadonlyArray<{ stage: PipelineStage; count: number }>;
  sceneIds: ReadonlySet<string>;
}

export function sessionHeldWork(sessionId: string): SessionHeldWork {
  const run = getRun(sessionId);
  if (!run || !run.paused) {
    return { stages: [], sceneIds: new Set() };
  }

  const stages: Array<{ stage: PipelineStage; count: number }> = [];
  const sceneIds = new Set<string>();

  for (const stage of PIPELINE_STAGES) {
    const launcher = launchers.get(stage);
    if (!launcher) continue;
    const result = launcher.heldWork(sessionId);
    if (result.count > 0) {
      stages.push({ stage, count: result.count });
      for (const id of result.sceneIds) sceneIds.add(id);
    }
  }

  return { stages, sceneIds };
}

export function launchHeldWork(sessionId: string): void {
  for (const stage of PIPELINE_STAGES) {
    const launcher = launchers.get(stage);
    if (!launcher) continue;
    const { count } = launcher.heldWork(sessionId);
    if (count > 0) {
      launcher.launch(sessionId);
    }
  }
}

/** Boot pass 1 (restart-recovery, Decision 1): every registered stage settles its in-flight units, in pipeline order. */
export function settleAllInFlight(): SettleSummary {
  const total: SettleSummary = { resumed: 0, recordedFailedAttempt: 0, stillPending: 0 };
  for (const stage of PIPELINE_STAGES) {
    const settled = launchers.get(stage)?.settleInFlight();
    if (!settled) continue;
    total.resumed += settled.resumed;
    total.recordedFailedAttempt += settled.recordedFailedAttempt;
    total.stillPending += settled.stillPending;
  }
  return total;
}

/** The stages with no registered launcher, hence no restart recovery; the boot log names them. */
export function stagesWithoutRestartRecovery(): PipelineStage[] {
  return PIPELINE_STAGES.filter((stage) => !launchers.has(stage));
}

/** Boot pass 2 (restart-recovery, Decision 1): launches each stage's pending work for a session; returns how many stages launched. */
export function relaunchPendingWork(sessionId: string): number {
  let launched = 0;
  for (const stage of PIPELINE_STAGES) {
    const launcher = launchers.get(stage);
    if (!launcher) continue;
    if ((launcher.pendingAtBoot ?? launcher.heldWork)(sessionId).count > 0) {
      launcher.launch(sessionId);
      launched++;
    }
  }
  return launched;
}

export interface CompletenessResult {
  ok: boolean;
  issues: string[];
}

export function checkCompleteness(): CompletenessResult {
  const issues: string[] = [];
  for (const stage of PIPELINE_STAGES) {
    const inRegistry = launchers.has(stage);
    const inNotYet = NOT_YET_LAUNCHABLE.has(stage);
    if (!inRegistry && !inNotYet) {
      issues.push(`stage '${stage}' is in neither the launcher registry nor NOT_YET_LAUNCHABLE`);
    }
    if (inRegistry && inNotYet) {
      issues.push(`stage '${stage}' is in both the launcher registry and NOT_YET_LAUNCHABLE`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Test-only: clears the launcher registry and resets NOT_YET_LAUNCHABLE to its default. */
export function resetRegistry(): void {
  launchers.clear();
  NOT_YET_LAUNCHABLE.clear();
  for (const s of defaultNotYetLaunchable) NOT_YET_LAUNCHABLE.add(s);
}
