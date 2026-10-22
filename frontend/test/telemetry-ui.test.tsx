import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { TelemetryConsentDialog } from "../src/components/TelemetryConsentDialog";
import { TopBar } from "../src/components/TopBar";
import { UpdateBanner } from "../src/components/UpdateBanner";

// add-observability-telemetry (JOS-199), group 7 — Decision 10: a native <dialog> for consent, a banner for updates.
afterEach(() => vi.unstubAllGlobals());

const OFF = { errors: false, providerUsage: false, productUsage: false };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("TelemetryConsentDialog", () => {
  it("is closed while not open", () => {
    render(<TelemetryConsentDialog open={false} consent={{ ...OFF, answered: true }} onSave={vi.fn()} onClose={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with all three boxes unchecked and the privacy sentence", () => {
    render(<TelemetryConsentDialog open consent={{ ...OFF, answered: false }} onSave={vi.fn()} onClose={vi.fn()} onDismiss={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Help improve Vid4You" });
    expect(dialog).toHaveTextContent("No script, media, file name or key is ever sent.");
    for (const name of ["Send error reports", "Send provider usage and cost counts", "Send anonymous usage counts"]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    }
  });

  it("shows the saved values when reopened", () => {
    render(<TelemetryConsentDialog open consent={{ errors: true, providerUsage: false, productUsage: true, answered: true }} onSave={vi.fn()} onClose={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Send error reports" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Send provider usage and cost counts" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Send anonymous usage counts" })).toBeChecked();
  });

  it("Save sends the chosen values and then closes", async () => {
    const onSave = vi.fn(async () => {});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TelemetryConsentDialog open consent={{ ...OFF, answered: false }} onSave={onSave} onClose={onClose} onDismiss={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: "Send error reports" }));
    await user.click(screen.getByRole("checkbox", { name: "Send anonymous usage counts" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ errors: true, providerUsage: false, productUsage: true });
  });

  it("Escape and Not now ask for a dismissal and never save by themselves", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<TelemetryConsentDialog open consent={{ ...OFF, answered: false }} onSave={onSave} onClose={onClose} onDismiss={onDismiss} />);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("links to the privacy policy in a new tab", () => {
    render(<TelemetryConsentDialog open consent={{ ...OFF, answered: false }} onSave={vi.fn()} onClose={vi.fn()} onDismiss={vi.fn()} />);
    const link = screen.getByRole("link", { name: "Privacy policy" });
    expect(link).toHaveAttribute("href", "https://github.com/TonyMElguezabal/AI4Devs-finalproject/blob/main/PRIVACY.md");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows the reason and stays open when saving fails", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TelemetryConsentDialog open consent={{ ...OFF, answered: false }} onSave={async () => Promise.reject(new Error("nope"))} onClose={onClose} onDismiss={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("nope");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Privacy button", () => {
  it("is shown only when a handler is given, and calls it", async () => {
    const onOpenPrivacy = vi.fn();
    const { rerender } = render(<TopBar />);
    expect(screen.queryByRole("button", { name: "Privacy" })).toBeNull();
    rerender(<TopBar onOpenPrivacy={onOpenPrivacy} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Privacy" }));
    expect(onOpenPrivacy).toHaveBeenCalled();
  });
});

describe("App consent flow", () => {
  function stubBackend(consent: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/telemetry/consent")) return jsonResponse(consent);
        if (String(url).endsWith("/languages")) return jsonResponse([{ code: "en", label: "English" }]);
        return jsonResponse({ available: false });
      }),
    );
  }

  it("opens the dialog on first load when the consent is unanswered", async () => {
    stubBackend({ ...OFF, answered: false });
    render(<App />);
    expect(await screen.findByRole("dialog", { name: "Help improve Vid4You" })).toBeTruthy();
  });

  function putBodies(): unknown[] {
    return vi.mocked(fetch).mock.calls
      .filter(([, init]) => (init)?.method === "PUT")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  }

  it("Not now on an unanswered consent records an all-off answer and closes", async () => {
    stubBackend({ ...OFF, answered: false });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(putBodies()).toEqual([OFF]);
  });

  it("Not now still closes when recording the answer fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") return jsonResponse({ ok: false }, 500);
        if (String(url).endsWith("/telemetry/consent")) return jsonResponse({ ...OFF, answered: false });
        if (String(url).endsWith("/languages")) return jsonResponse([{ code: "en", label: "English" }]);
        return jsonResponse({ available: false });
      }),
    );
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Not now on an answered consent sends nothing and keeps the choices", async () => {
    stubBackend({ ...OFF, errors: true, answered: true });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Privacy" }));
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(putBodies()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Privacy" }));
    expect(await screen.findByRole("checkbox", { name: "Send error reports" })).toBeChecked();
  });

  it("stays closed when answered, and the Privacy button reopens it", async () => {
    stubBackend({ ...OFF, errors: true, answered: true });
    render(<App />);
    await screen.findByRole("button", { name: "Privacy" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Privacy" }));
    expect(await screen.findByRole("checkbox", { name: "Send error reports" })).toBeChecked();
  });
});

describe("UpdateBanner", () => {
  function stubUpdate(body: unknown, status = 200) {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(body, status)));
  }

  it("is hidden when no update is available", async () => {
    stubUpdate({ available: false });
    render(<UpdateBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/new version/i)).toBeNull();
  });

  it("is hidden when the request fails", async () => {
    stubUpdate({ ok: false, reason: "x" }, 500);
    render(<UpdateBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/new version/i)).toBeNull();
  });

  it("shows the release link when an update is available, and Dismiss hides it", async () => {
    stubUpdate({ available: true, tag: "t2", url: "https://github.com/o/r/releases/tag/t2" });
    const user = userEvent.setup();
    render(<UpdateBanner />);
    expect(await screen.findByText("A new version of Vid4You is available")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View release" })).toHaveAttribute("href", "https://github.com/o/r/releases/tag/t2");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("A new version of Vid4You is available")).toBeNull();
  });
});
