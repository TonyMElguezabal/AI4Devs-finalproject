import type { ReactElement } from "react";

/** The closed set of glyphs the interface uses (redesign-visual-design, JOS-198, design Decision 6). */
export type IconName = "check" | "progress" | "failed" | "queued" | "pause" | "play" | "download" | "retry" | "chevron" | "plus";

const GLYPH: Record<IconName, ReactElement> = {
  check: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path className="icon-cutout" d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  progress: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  failed: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path className="icon-cutout" d="M8 4.5v4.2" fill="none" strokeWidth="1.8" strokeLinecap="round" />
      <circle className="icon-cutout-fill" cx="8" cy="11.3" r="1" />
    </>
  ),
  queued: <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.4" />,
  pause: (
    <>
      <rect x="4" y="3" width="2.6" height="10" rx="1" fill="currentColor" />
      <rect x="9.4" y="3" width="2.6" height="10" rx="1" fill="currentColor" />
    </>
  ),
  play: <path d="M5 3.2v9.6l7.6-4.8z" fill="currentColor" />,
  download: <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  retry: <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  chevron: <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  plus: <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
};

/**
 * A decorative glyph: always hidden from the accessibility tree, so it can sit beside a label without changing
 * the element's accessible name (spec "Styling does not regress the accessibility contract").
 */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={`icon icon-${name}`} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {GLYPH[name]}
    </svg>
  );
}
