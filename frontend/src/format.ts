/** admin-tabs-and-tables (JOS-270), Decision 4 — the instant of a report row: a medium date and a short time, in the computer's time zone. */
export const formatInstant = (iso: string): string => new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });

/** A value the store never recorded (for example scene attempts keep no time-out outcome); not the same as 0. */
export const NOT_RECORDED = "n/a";
