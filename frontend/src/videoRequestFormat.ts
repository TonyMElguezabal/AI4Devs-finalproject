// show-video-request-status (JOS-200) — how the clip request block writes times; one place, so the tests and the page agree.

/** `3 min 30 s`, or `45 s` under a minute; never negative (the browser clock can be a little behind the server's). */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return whole < 60 ? `${whole} s` : `${Math.floor(whole / 60)} min ${whole % 60} s`;
}

/** The time of day in the User's locale, to the second. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
