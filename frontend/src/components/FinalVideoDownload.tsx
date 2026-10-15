import { Icon } from "./Icon";

interface Props {
  url: string | undefined;
}

/** PRD §12.3 — the final MP4 is offered only when the session read publishes
 * a route for it (download-final-video, JOS-164, design Decision 2); nothing
 * is offered for the MP3, timestamps or generated texts (out of scope for
 * the UI entirely, not just gated).
 *
 * redesign-visual-design (JOS-198) — until it is published, the card says so instead of staying empty. */
export function FinalVideoDownload({ url }: Props) {
  if (!url) return <p className="final-video final-video-pending">Available once every scene is done</p>;
  return (
    <div className="final-video">
      <a className="button primary large" href={url}>
        <Icon name="download" />
        Download final video
      </a>
    </div>
  );
}
