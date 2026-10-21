import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { AdminPage } from "../src/components/AdminPage";
import { adminFetch, API_BASE } from "../src/api/client";

// protect-admin-with-password (JOS-173), group 4 — design Decisions 2 and 5; spec AC1-AC3 on the page side.
// `fetch` is mocked: the page is driven by the 401 reasons the backend's gate gives.

const PASSWORD = "correct-horse-battery-staple";
const WRONG = "wrong-horse-battery-staple";

type Call = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const denied = (reason: string) => jsonResponse({ ok: false, reason }, 401);
const authorizationOf = (call: Call) => new Headers(call.init?.headers).get("authorization");

/** A backend whose Administrator password is `configured` (or none): the same answers the real gate gives. */
function stubAdminBackend(configured: string | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === `${API_BASE}/admin/access`) {
        const supplied = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "");
        if (configured === undefined) return denied("not-configured");
        if (!supplied) return denied("password-required");
        if (supplied !== configured) return denied("wrong-password");
        return jsonResponse({ configured: true, granted: true });
      }
      if (url.endsWith("/languages")) return jsonResponse([{ code: "en", label: "English" }]);
      if (url.endsWith("/telemetry/consent")) return jsonResponse({ errors: false, providerUsage: false, productUsage: false, answered: true });
      if (url.endsWith("/app/update")) return jsonResponse({ updateAvailable: false });
      return jsonResponse({}, 404);
    }),
  );
  return calls;
}

/**
 * A recording stand-in for browser storage. Node 26 ships an experimental `localStorage` that is undefined without
 * `--localstorage-file` and shadows jsdom's, so the tests install their own; it also lets them see every write.
 */
class RecordingStorage implements Storage {
  readonly writes: string[] = [];
  private readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.writes.push(`${key}=${value}`);
    this.items.set(key, value);
  }
  [name: string]: unknown;
}

let local: RecordingStorage;
let session: RecordingStorage;

beforeEach(() => {
  window.history.pushState({}, "", "/admin");
  local = new RecordingStorage();
  session = new RecordingStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function unlock(password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Unlock" }));
}

describe("AdminPage with no Administrator password configured (spec 'The app starts without an Administrator password')", () => {
  it("says so, explains how to set it, and offers no password field or Administrator action", async () => {
    stubAdminBackend(undefined);
    render(<AdminPage />);

    const message = (await screen.findByText(/No Administrator password is configured/)).closest(".callout");
    expect(message).not.toBeNull();
    expect(message).toHaveTextContent("ADMIN_PASSWORD");
    expect(message).toHaveTextContent(/environment or in the local secrets file/);
    expect(message).toHaveTextContent(/restart/i);
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlock" })).toBeNull();
    expect(screen.queryByText("No Administrator tools yet")).toBeNull();
  });
});

describe("AdminPage with a password configured", () => {
  it("asks for the password first: a field and an Unlock button, and no Administrator area (locked)", async () => {
    stubAdminBackend(PASSWORD);
    render(<AdminPage />);

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
    expect(screen.queryByText("No Administrator tools yet")).toBeNull();
  });

  it("shows 'Wrong password' and no Administrator area for a different password (AC2)", async () => {
    stubAdminBackend(PASSWORD);
    render(<AdminPage />);

    await unlock(WRONG);

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong password");
    expect(screen.queryByText("No Administrator tools yet")).toBeNull();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows the Administrator area for the correct password (AC1)", async () => {
    stubAdminBackend(PASSWORD);
    render(<AdminPage />);

    await unlock(PASSWORD);

    expect(await screen.findByText("No Administrator tools yet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hands the password and an 'onDenied' to the tools slot, and a later 401 returns the page to locked", async () => {
    const calls = stubAdminBackend(PASSWORD);
    const user = userEvent.setup();
    render(
      <AdminPage
        tools={({ password, onDenied }) => (
          <button
            type="button"
            onClick={async () => {
              // An Administrator call after the backend's password changed: the gate now answers 401.
              const response = await adminFetch("/admin/something", password);
              if (response.status === 401) onDenied();
            }}
          >
            Call a tool
          </button>
        )}
      />,
    );

    await unlock(PASSWORD);
    vi.stubGlobal("fetch", vi.fn(async () => denied("wrong-password")));
    await user.click(await screen.findByRole("button", { name: "Call a tool" }));

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Call a tool" })).toBeNull();
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe("The password stays in page memory (spec 'The password never leaves the configuration')", () => {
  it("is sent as 'Authorization: Bearer <password>' when unlocking", async () => {
    const calls = stubAdminBackend(PASSWORD);
    render(<AdminPage />);

    await unlock(PASSWORD);
    await screen.findByText("No Administrator tools yet");

    const unlockCall = calls.filter((call) => call.url === `${API_BASE}/admin/access`).at(-1)!;
    expect(authorizationOf(unlockCall)).toBe(`Bearer ${PASSWORD}`);
    // The first, automatic check on load carries no password.
    expect(authorizationOf(calls.find((call) => call.url === `${API_BASE}/admin/access`)!)).toBeNull();
  });

  it("is in neither localStorage, sessionStorage, a cookie nor the address after unlocking", async () => {
    stubAdminBackend(PASSWORD);
    render(<AdminPage />);

    await unlock(PASSWORD);
    await screen.findByText("No Administrator tools yet");

    // Nothing was written to either storage, not even under another key.
    expect(local.writes).toEqual([]);
    expect(session.writes).toEqual([]);
    expect(local.length + session.length).toBe(0);
    expect(document.cookie).not.toContain(PASSWORD);
    expect(window.location.href).not.toContain(PASSWORD);
  });

  it("is asked for again after the page is reloaded", async () => {
    stubAdminBackend(PASSWORD);
    const first = render(<AdminPage />);
    await unlock(PASSWORD);
    await screen.findByText("No Administrator tools yet");
    first.unmount();

    render(<AdminPage />); // a reload mounts a fresh page with fresh memory
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByText("No Administrator tools yet")).toBeNull();
  });
});

describe("adminFetch", () => {
  it("adds the Authorization header, keeps the caller's own headers, and targets the API base", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (calls.push({ url, init }), jsonResponse({}))));

    await adminFetch("/admin/x", PASSWORD, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });

    expect(calls[0]!.url).toBe(`${API_BASE}/admin/x`);
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(authorizationOf(calls[0]!)).toBe(`Bearer ${PASSWORD}`);
    expect(new Headers(calls[0]!.init?.headers).get("content-type")).toBe("application/json");
  });

  it("sends no Authorization header when it has no password", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (calls.push({ url, init }), jsonResponse({}))));

    await adminFetch("/admin/x", undefined);

    expect(authorizationOf(calls[0]!)).toBeNull();
  });
});

describe("App routing (AC3)", () => {
  /** A fake live connection that never connects: the session page only needs it not to throw. */
  class QuietEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    readyState = 0;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: (() => void) | null = null;
    addEventListener() {}
    removeEventListener() {}
    close() {
      this.readyState = 2;
    }
  }

  it("renders the Administrator page at /admin", async () => {
    const calls = stubAdminBackend(PASSWORD);
    window.history.pushState({}, "", "/admin");
    render(<App />);

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(calls.some((call) => call.url === `${API_BASE}/admin/access`)).toBe(true);
    // The start form and the privacy prompt belong to the regular pages.
    expect(screen.queryByRole("form", { name: "Start a project" })).toBeNull();
    expect(calls.some((call) => call.url.endsWith("/telemetry/consent"))).toBe(false);
  });

  it("renders the start page at / as before: no password field, no /admin link, no /admin request", async () => {
    const calls = stubAdminBackend(PASSWORD);
    window.history.pushState({}, "", "/");
    render(<App />);

    expect(await screen.findByRole("form", { name: "Start a project" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(document.querySelector('a[href*="admin"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /admin/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /admin/i })).toBeNull();
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/languages"))).toBe(true));
    expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
  });

  it("renders a session page at /?sessionId= as before: no password field, no /admin link, no /admin request", async () => {
    vi.stubGlobal("EventSource", QuietEventSource as unknown as typeof EventSource);
    const calls = stubAdminBackend(PASSWORD);
    window.history.pushState({}, "", "/?sessionId=01J00000000000000000000173");
    render(<App />);

    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/languages"))).toBe(true));
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(document.querySelector('a[href*="admin"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /admin/i })).toBeNull();
    expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
  });
});
