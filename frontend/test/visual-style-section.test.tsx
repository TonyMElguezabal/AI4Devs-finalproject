import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualStyleSection } from "../src/components/VisualStyleSection";

// admin-visual-style-prompt (JOS-201), group 5 — design Decision 9: the visual style section, one of the Administrator
// tools behind the password (protect-admin-with-password, JOS-173).
afterEach(() => {
  vi.unstubAllGlobals();
});

const PASSWORD = "admin-test";
const onDenied = vi.fn();
const renderSection = () => render(<VisualStyleSection password={PASSWORD} onDenied={onDenied} />);

type Settings = { visualStylePrompt: string; referenceImage: { contentType: string; sizeBytes: number; updatedAt: string } | null; updatedAt: string };
const EMPTY: Settings = { visualStylePrompt: "", referenceImage: null, updatedAt: "2026-10-19T10:00:00.000Z" };
const WITH_IMAGE: Settings = {
  visualStylePrompt: "Warry, a 2D cartoon",
  referenceImage: { contentType: "image/png", sizeBytes: 1234, updatedAt: "2026-10-19T10:05:00.000Z" },
  updatedAt: "2026-10-19T10:05:00.000Z",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Stubs fetch with an in-memory settings store behind the five endpoints; `overrides` lets a test force an answer. */
function stubBackend(initial: Settings, overrides: Partial<Record<string, () => Response>> = {}) {
  let settings = initial;
  const calls: Array<{ method: string; path: string; body?: unknown; authorization?: string | null }> = [];
  // jsdom has no object URLs; the preview shows the fetched bytes through one.
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:reference-preview", revokeObjectURL: () => undefined }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      calls.push({ method, path, body: init?.body, authorization: headers.get("Authorization") });
      const key = `${method} ${path}`;
      if (overrides[key]) return overrides[key]();
      if (key === "GET /admin/settings") return json(settings);
      if (key === "GET /admin/settings/reference-image") return new Response(new Uint8Array([0x89, 0x50]), { status: 200, headers: { "Content-Type": "image/png" } });
      if (key === "PUT /admin/settings/visual-style-prompt") {
        settings = { ...settings, visualStylePrompt: JSON.parse(String(init!.body)).visualStylePrompt.trim() };
        return json(settings);
      }
      if (key === "PUT /admin/settings/reference-image") {
        settings = { ...settings, referenceImage: { contentType: headers.get("Content-Type")!, sizeBytes: 10, updatedAt: "2026-10-19T11:00:00.000Z" } };
        return json(settings);
      }
      if (key === "DELETE /admin/settings/reference-image") {
        settings = { ...settings, referenceImage: null };
        return new Response(null, { status: 204 });
      }
      return json({ ok: false, reason: `unexpected ${key}` }, 500);
    }),
  );
  return calls;
}

const png = (size = 10, name = "face.png", type = "image/png") => new File([new Uint8Array(size)], name, { type });

describe("VisualStyleSection prompt", () => {
  it("loads the saved prompt and shows the counter and the hint about the pipeline rules", async () => {
    stubBackend(WITH_IMAGE);
    renderSection();
    expect(await screen.findByLabelText("Visual style prompt")).toHaveValue("Warry, a 2D cartoon");
    expect(screen.getByText("19 / 8000")).toBeInTheDocument();
    expect(screen.getByText(/these rules win/i)).toBeInTheDocument();
  });

  it("saves the prompt and shows a success message", async () => {
    const calls = stubBackend(EMPTY);
    const user = userEvent.setup();
    renderSection();
    await user.type(await screen.findByLabelText("Visual style prompt"), "Warry");
    await user.click(screen.getByRole("button", { name: "Save prompt" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Prompt saved.");
    expect(calls.find((c) => c.method === "PUT")?.body).toBe(JSON.stringify({ visualStylePrompt: "Warry" }));
  });

  it("shows the backend's reason on a rejected save and keeps the typed text", async () => {
    stubBackend(EMPTY, { "PUT /admin/settings/visual-style-prompt": () => json({ message: "too long" }, 400) });
    const user = userEvent.setup();
    renderSection();
    await user.type(await screen.findByLabelText("Visual style prompt"), "Warry");
    await user.click(screen.getByRole("button", { name: "Save prompt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("too long");
    expect(screen.getByLabelText("Visual style prompt")).toHaveValue("Warry");
  });

  it("shows an error and keeps the text when the backend cannot be reached", async () => {
    stubBackend(EMPTY, { "PUT /admin/settings/visual-style-prompt": () => Promise.reject(new TypeError("Failed to fetch")) as unknown as Response });
    const user = userEvent.setup();
    renderSection();
    await user.type(await screen.findByLabelText("Visual style prompt"), "Warry");
    await user.click(screen.getByRole("button", { name: "Save prompt" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Visual style prompt")).toHaveValue("Warry");
  });

  it("disables saving above 8,000 characters", async () => {
    stubBackend({ ...EMPTY, visualStylePrompt: "x".repeat(8001) });
    renderSection();
    await screen.findByLabelText("Visual style prompt");
    expect(screen.getByRole("button", { name: "Save prompt" })).toBeDisabled();
    expect(screen.getByText("8001 / 8000")).toBeInTheDocument();
  });

  it("shows an error when the settings cannot be loaded", async () => {
    stubBackend(EMPTY, { "GET /admin/settings": () => json({ ok: false, reason: "boom" }, 500) });
    renderSection();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});

describe("VisualStyleSection reference image", () => {
  it("shows the preview and a remove button when an image is stored, and says it is not used yet", async () => {
    stubBackend(WITH_IMAGE);
    renderSection();
    const preview = await screen.findByAltText("Reference image preview");
    expect(preview).toHaveAttribute("src", "blob:reference-preview");
    expect(screen.getByRole("button", { name: "Remove image" })).toBeInTheDocument();
    expect(screen.getByText(/not sent to the image provider yet/i)).toBeInTheDocument();
  });

  it("uploads a chosen image with its content type and shows the preview", async () => {
    const calls = stubBackend(EMPTY);
    const user = userEvent.setup();
    renderSection();
    expect(screen.queryByAltText("Reference image preview")).toBeNull();
    await user.upload(await screen.findByLabelText("Reference image"), png());
    expect(await screen.findByAltText("Reference image preview")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT" && c.path === "/admin/settings/reference-image")).toBe(true);
  });

  it("rejects a GIF or a file over 5 MB without sending anything", async () => {
    const calls = stubBackend(WITH_IMAGE);
    const user = userEvent.setup({ applyAccept: false });
    renderSection();
    const input = await screen.findByLabelText("Reference image");
    await user.upload(input, png(10, "a.gif", "image/gif"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/PNG, JPEG or WebP/);
    await user.upload(input, png(5 * 1024 * 1024 + 1));
    expect(await screen.findByRole("alert")).toHaveTextContent(/5 MB/);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    expect(screen.getByAltText("Reference image preview")).toBeInTheDocument();
  });

  it("shows the backend's refusal and keeps the stored image", async () => {
    stubBackend(WITH_IMAGE, { "PUT /admin/settings/reference-image": () => json({ ok: false, reason: "the file is not a valid image/png image" }, 400) });
    const user = userEvent.setup();
    renderSection();
    await user.upload(await screen.findByLabelText("Reference image"), png());
    expect(await screen.findByRole("alert")).toHaveTextContent("not a valid image/png");
    expect(screen.getByAltText("Reference image preview")).toBeInTheDocument();
  });

  it("removes the stored image", async () => {
    stubBackend(WITH_IMAGE);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "Remove image" }));
    await waitFor(() => expect(screen.queryByAltText("Reference image preview")).toBeNull());
    expect(screen.queryByRole("button", { name: "Remove image" })).toBeNull();
  });
});

describe("Behind the Administrator password (JOS-173)", () => {
  it("sends the password with every request, including the preview", async () => {
    const calls = stubBackend(WITH_IMAGE);
    const user = userEvent.setup();
    renderSection();
    await screen.findByAltText("Reference image preview");
    await user.click(screen.getByRole("button", { name: "Save prompt" }));
    await screen.findByRole("status");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(
      expect.arrayContaining(["GET /admin/settings", "GET /admin/settings/reference-image", "PUT /admin/settings/visual-style-prompt"]),
    );
    expect(calls.every((c) => c.authorization === `Bearer ${PASSWORD}`)).toBe(true);
  });

  it("locks the page again when a request is refused with 401", async () => {
    onDenied.mockClear();
    stubBackend(EMPTY, { "GET /admin/settings": () => json({ ok: false, reason: "wrong-password" }, 401) });
    renderSection();
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Visual style prompt")).toBeNull();
  });
});
