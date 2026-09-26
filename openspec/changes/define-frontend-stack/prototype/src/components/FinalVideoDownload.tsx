import type { SessionState } from "../types";

interface Props {
  state: SessionState;
  url: string;
}

/** PRD §12.3 — the final MP4 is offered only once `final-video` is reached;
 * nothing is offered for the MP3, timestamps or generated texts (out of
 * scope for the UI entirely, not just gated). */
export function FinalVideoDownload({ state, url }: Props) {
  if (state !== "final-video") return null;
  return (
    <p className="final-video">
      <a href={url}>Download final video</a>
    </p>
  );
}
