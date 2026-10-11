interface Props {
  url: string | undefined;
}

/** PRD §12.3 — the final MP4 is offered only when the session read publishes
 * a route for it (download-final-video, JOS-164, design Decision 2); nothing
 * is offered for the MP3, timestamps or generated texts (out of scope for
 * the UI entirely, not just gated). */
export function FinalVideoDownload({ url }: Props) {
  if (!url) return null;
  return (
    <p className="final-video">
      <a href={url}>Download final video</a>
    </p>
  );
}
