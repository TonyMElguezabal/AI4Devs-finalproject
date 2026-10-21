import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getAdminAccess } from "../api/client";

/** What the Administrator area hands to a tool: the password for `adminFetch`, and a way to report a 401. */
export interface AdminToolsContext {
  password: string;
  /** Call when an Administrator request is refused with 401 (for example after the password was changed): the page locks again. */
  onDenied: () => void;
}

interface Props {
  /** The slot JOS-171 and JOS-172 fill with their sections. Absent: the area says there are no tools yet. */
  tools?: (context: AdminToolsContext) => ReactNode;
}

type PageState =
  | { kind: "checking" }
  | { kind: "not-configured" }
  | { kind: "locked"; message?: string }
  | { kind: "unlocked"; password: string }
  | { kind: "unreachable" };

/**
 * protect-admin-with-password (JOS-173), design Decision 5 — `/admin`: a password form, then the Administrator
 * area. The entered password lives in this component's state only: never in browser storage, the address or a
 * cookie, so a reload asks again. The page decides what to show from the backend's 401 reasons.
 */
export function AdminPage({ tools }: Props) {
  const [state, setState] = useState<PageState>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);

  // First look, with no password: "not configured" or "ask for the password".
  useEffect(() => {
    let cancelled = false;
    getAdminAccess()
      .then((result) => {
        if (cancelled) return;
        setState(result.kind === "denied" && result.reason === "not-configured" ? { kind: "not-configured" } : { kind: "locked" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "unreachable" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUnlock(event: FormEvent) {
    event.preventDefault();
    if (password.length === 0 || checking) return;
    setChecking(true);
    try {
      const result = await getAdminAccess(password);
      if (result.kind === "granted") {
        setState({ kind: "unlocked", password });
        setPassword("");
      } else if (result.reason === "not-configured") {
        setState({ kind: "not-configured" });
      } else {
        setState({ kind: "locked", message: result.reason === "wrong-password" ? "Wrong password" : "Enter the password" });
      }
    } catch {
      setState({ kind: "locked", message: "Could not check the password. Is the app running?" });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="start">
      <div className="start-head pop">
        <h1>Administrator</h1>
      </div>

      {state.kind === "checking" && <p className="session-loading">Checking access…</p>}

      {state.kind === "unreachable" && (
        <p role="alert" className="form-error">
          Could not reach the app. Is it running?
        </p>
      )}

      {state.kind === "not-configured" && (
        <div className="callout callout-info pop">
          <div className="callout-body">
            <strong>No Administrator password is configured.</strong>
            <span>
              Set <code>ADMIN_PASSWORD</code> in the environment or in the local secrets file, then restart the app. The regular pages do not need
              it.
            </span>
          </div>
        </div>
      )}

      {state.kind === "locked" && (
        <form onSubmit={handleUnlock} aria-label="Administrator password" className="start-form card pop">
          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {state.message && (
            <p role="alert" className="form-error">
              {state.message}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="primary large" disabled={password.length === 0 || checking}>
              Unlock
            </button>
          </div>
        </form>
      )}

      {state.kind === "unlocked" && (
        <section aria-label="Administrator tools" className="start-form card pop">
          {tools ? tools({ password: state.password, onDenied: () => setState({ kind: "locked", message: "Enter the password again" }) }) : <p>No Administrator tools yet</p>}
        </section>
      )}
    </div>
  );
}
