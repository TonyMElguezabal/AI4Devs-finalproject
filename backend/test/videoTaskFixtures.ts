import type { VideoGenerationResult, VideoProvider } from "../src/videoProvider.ts";

// keep-clip-task-on-timeout (JOS-204) — a video provider whose answers a test controls, shared by the limit and restart tests.

export const MP4_BYTES = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.alloc(8)]);

/** A provider whose answer to every poll can be changed, that counts the tasks submitted to it (keep-clip-task-on-timeout, JOS-204). */
export function switchableProvider(): { provider: VideoProvider; answer: { current: VideoGenerationResult }; byTask: Map<string, VideoGenerationResult>; submits: () => number; polled: Set<string> } {
  const answer: { current: VideoGenerationResult } = { current: { kind: "pending" } };
  const byTask = new Map<string, VideoGenerationResult>();
  const polled = new Set<string>();
  let submitted = 0;
  const provider: VideoProvider = {
    async submit({ instruction, durationSeconds }) {
      submitted++;
      return { kind: "submitted", requestId: `task-${submitted}`, sentBody: { prompt: instruction, duration: durationSeconds } };
    },
    async poll(requestId) {
      polled.add(requestId);
      return byTask.get(requestId) ?? answer.current;
    },
  };
  return { provider, answer, byTask, submits: () => submitted, polled };
}
