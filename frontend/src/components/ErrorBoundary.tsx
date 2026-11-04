import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportFrontendError } from "../api/client";
import type { FrontendErrorKind } from "../types";

interface ErrorBoundaryProps {
  children: ReactNode;
  report?: (kind: FrontendErrorKind, reason: unknown) => unknown;
  reload?: () => void;
}

/**
 * cover-error-reporting (JOS-254), design D3 — a component that throws while rendering replaces the app with this
 * fallback instead of a blank page, and is reported once as `render`. React 18 has no hook for this; it is a class.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    void (this.props.report ?? reportFrontendError)("render", error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const reload = this.props.reload ?? (() => window.location.reload());
    return (
      <main className="app-main">
        <section className="card" aria-labelledby="error-fallback-title">
          <h1 id="error-fallback-title">Something went wrong</h1>
          <p>The page stopped working. Reload to continue.</p>
          <button type="button" className="primary" onClick={reload}>
            Reload
          </button>
        </section>
      </main>
    );
  }
}
