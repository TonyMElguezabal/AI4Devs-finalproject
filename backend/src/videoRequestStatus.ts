import { videoTaskCeilingMs } from "./config/providers.ts";
import { db, sceneCurrentRequestId } from "./db.ts";
import { nearestRankPercentile } from "./providerUsageReport.ts";
import { describeProvider } from "./stageDiagnostics.ts";
import type { Scene, VideoRequestBody, VideoRequestView } from "./types.ts";

// show-video-request-status (JOS-200) Decisions 2, 4 and 6 — what the page may know about a clip request in flight:
// an allow-list of the body that was sent, and an estimate calculated from the clips already generated.

/** The adapter's sent body reduced to what the page may show. Anything else it sent (the provider's upload URL, extra fields) is dropped. */
export function allowListVideoRequest(sentBody: Record<string, unknown>, sceneIndex: number): VideoRequestBody {
  return {
    prompt: typeof sentBody.prompt === "string" ? sentBody.prompt : "",
    duration: typeof sentBody.duration === "number" ? sentBody.duration : 0,
    resolution: typeof sentBody.resolution === "string" ? sentBody.resolution : "",
    firstFrame: `scene ${sceneIndex} image`,
  };
}

/** Clips of the same provider and requested duration needed before their median is used alone. */
const MIN_SAME_DURATION_CLIPS = 3;

function successSeconds(provider: string, requestedDuration: number | null): number[] {
  const rows = (
    requestedDuration === null
      ? db.prepare("SELECT p.latency_ms AS ms FROM provider_requests p WHERE p.stage = 'video' AND p.mode = 'success' AND p.provider_id = ?").all(provider)
      : db
          .prepare(
            "SELECT p.latency_ms AS ms FROM provider_requests p JOIN scenes s ON s.id = p.scene_id WHERE p.stage = 'video' AND p.mode = 'success' AND p.provider_id = ? AND s.requested_duration_seconds = ?",
          )
          .all(provider, requestedDuration)
  ) as Array<{ ms: number }>;
  return rows.map((row) => row.ms / 1000);
}

/** The median generation time of earlier successful clips: the same provider and duration (at least 3), else the provider's clips of any duration, else none. */
export function videoEstimate(provider: string | null, requestedDuration: number | null): { seconds: number; basedOn: number } | null {
  if (provider === null) return null;
  const sameDuration = successSeconds(provider, requestedDuration);
  const clips = sameDuration.length >= MIN_SAME_DURATION_CLIPS ? sameDuration : successSeconds(provider, null);
  const seconds = nearestRankPercentile(clips, 0.5);
  return seconds === null ? null : { seconds, basedOn: clips.length };
}

// show-clip-task-liveness (JOS-233), design Decision 2 — the last "still running" answer per scene, in memory only: it
// means "this running application is following the task", so a restart honestly starts with none, and a check of an
// earlier task (a retry) is never shown for the current one because the task id has to match.
const taskChecks = new Map<string, { taskId: string; at: string }>();

export function recordTaskCheck(sceneId: string, taskId: string, at: string): void {
  taskChecks.set(sceneId, { taskId, at });
}

/** Test-only: what a new process starts with. */
export function resetTaskChecksForTests(): void {
  taskChecks.clear();
}

/** The request status of a scene whose clip request was sent and has not ended; `undefined` otherwise. */
export function videoRequestView(scene: Scene): VideoRequestView | undefined {
  if (scene.status !== "video-generating" || scene.videoRequestSentAt === null || scene.videoRequestBody === null) return undefined;
  // Once the request is sent the column holds the provider's own task id (design Decision 1); never read before that.
  const taskId = sceneCurrentRequestId(scene.id) ?? "";
  const check = taskChecks.get(scene.id);
  const ceilingMs = videoTaskCeilingMs();
  return {
    provider: describeProvider("video", scene.videoProvider),
    attempt: scene.attempts,
    sentAt: scene.videoRequestSentAt,
    estimate: videoEstimate(scene.videoProvider, scene.requestedDurationSeconds),
    body: scene.videoRequestBody,
    taskId,
    lastCheckedAt: check && check.taskId === taskId ? check.at : null,
    waitEndsAt: ceilingMs === undefined ? null : new Date(Date.parse(scene.videoRequestSentAt) + ceilingMs).toISOString(),
  };
}
