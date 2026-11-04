import { reportFrontendError } from "./api/client";
import type { FrontendErrorKind } from "./types";

/**
 * cover-error-reporting (JOS-254), design D3 — uncaught errors and unhandled rejections, once, before the app renders.
 * A resource that fails to load fires `error` only in the capture phase, so it is not reported here.
 */
export function installGlobalErrorReporting(
  target: EventTarget = window,
  report: (kind: FrontendErrorKind, reason: unknown) => unknown = reportFrontendError,
): void {
  target.addEventListener("error", (event) => {
    const errorEvent = event as ErrorEvent;
    const error: unknown = errorEvent.error;
    void report("error", error ?? errorEvent.message); // a cross-origin script gives no error, only "Script error."
  });
  target.addEventListener("unhandledrejection", (event) => {
    void report("unhandledrejection", (event as PromiseRejectionEvent).reason);
  });
}
