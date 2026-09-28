import { getVoiceOver } from "./db.ts";

// lock-script-and-narration (JOS-137) Decision 4 — the one answer to "may
// voice generation launch for this session?" (PRD §4.2, §10.3). Every caller
// that launches voice generation — the first launch, the automatic retry
// (JOS-154) and the manual retry (JOS-155) — asks this first.
//
// It reads the voice-over RECORD, not the derived session state: a failed
// attempt never creates the record (a provider rejection, or audio that could
// not be decoded), so such a session stays launchable and the relaunch is a
// retry, not a regeneration. A session that is `failed` in a later phase while
// its narration exists is still refused, which a state-based check would get
// wrong.

export type VoiceLaunchDecision = { allowed: true } | { allowed: false; reason: "narration-complete" };

export function canLaunchVoiceOver(runId: string): VoiceLaunchDecision {
  return getVoiceOver(runId) === undefined ? { allowed: true } : { allowed: false, reason: "narration-complete" };
}
