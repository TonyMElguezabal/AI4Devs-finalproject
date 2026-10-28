import { join } from "node:path";

// add-burned-in-subtitles (JOS-237), design Decision 4 — where the adapter finds the bundled subtitle font. The
// packaged app puts `Montserrat-Bold.ttf` beside its executable and sets `SUBTITLE_FONT_PATH` (like `FFMPEG_PATH`);
// in development it is `backend/assets/fonts/Montserrat-Bold.ttf`. A system font is never used.

/** `SUBTITLE_FONT_PATH` wins; otherwise the font bundled with the backend. */
export function resolveSubtitleFontPath(env: Record<string, string | undefined> = process.env): string {
  return env.SUBTITLE_FONT_PATH || join(import.meta.dirname, "../../assets/fonts/Montserrat-Bold.ttf");
}
