import { useEffect, useState } from "react";
import type { VideoRequestView } from "../types";
import { formatClock, formatElapsed } from "../videoRequestFormat";

interface Props {
  sceneIndex: number;
  request: VideoRequestView;
}

/**
 * show-video-request-status (JOS-200), design Decision 5 — what was sent for a clip that is still generating, when, how
 * long it has taken and when it may arrive, plus (JOS-233) the provider's task id, how long ago it was last checked and when
 * the wait ends. The clock is the browser's, ticking once a second while the block is
 * shown, so the server does not push a snapshot per second.
 */
export function VideoRequestStatus({ sceneIndex, request }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sentAtMs = Date.parse(request.sentAt);
  const elapsedSeconds = (nowMs - sentAtMs) / 1000;
  const { estimate } = request;
  const { name, model } = request.provider;

  return (
    <div role="group" aria-label={`Scene ${sceneIndex} clip request`} className="video-request">
      <dl>
        <dt>Request</dt>
        <dd>
          {model ? `${name} (${model})` : name}, attempt {request.attempt}
        </dd>
        <dt>Sent at</dt>
        <dd>
          <time dateTime={request.sentAt}>{formatClock(request.sentAt)}</time>
        </dd>
        <dt>Elapsed</dt>
        <dd>{formatElapsed(elapsedSeconds)}</dd>
        <dt>Estimate</dt>
        <dd>
          {estimate === null
            ? "No estimate yet"
            : elapsedSeconds > estimate.seconds
              ? "Taking longer than estimated"
              : `Expected around ${formatClock(new Date(sentAtMs + estimate.seconds * 1000).toISOString())}, based on ${estimate.basedOn} earlier ${estimate.basedOn === 1 ? "clip" : "clips"}`}
        </dd>
        <dt>Task id</dt>
        <dd>
          <code className="video-request-task-id">{request.taskId}</code>
        </dd>
        <dt>Last checked</dt>
        <dd>{request.lastCheckedAt === null ? "Not checked yet" : `${formatElapsed((nowMs - Date.parse(request.lastCheckedAt)) / 1000)} ago`}</dd>
        {request.waitEndsAt !== null && (
          <>
            <dt>Gives up at</dt>
            <dd>{formatClock(request.waitEndsAt)} if unfinished</dd>
          </>
        )}
      </dl>
      <button type="button" className="toggle" aria-expanded={showJson} onClick={() => setShowJson((open) => !open)}>
        {showJson ? `Hide the request sent for scene ${sceneIndex}` : `Show the request sent for scene ${sceneIndex}`}
      </button>
      {showJson && (
        <pre aria-label={`Scene ${sceneIndex} clip request JSON`} className="video-request-json">
          {JSON.stringify(request.body, null, 2)}
        </pre>
      )}
    </div>
  );
}
