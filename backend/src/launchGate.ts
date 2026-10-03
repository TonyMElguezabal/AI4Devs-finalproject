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

export interface StageLauncher {
  stage: PipelineStage;
  heldWork: (sessionId: string) => HeldWorkResult;
  launch: (sessionId: string) => void;
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
