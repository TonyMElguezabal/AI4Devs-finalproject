import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../src/api/client";
import { ProviderProfilesSection } from "../src/components/ProviderProfilesSection";
import type { AdapterTypeInfo, ProfileView } from "../src/types";

// test-provider-connection (JOS-220), group 4 — the "Test connection" button, the charge notice and the result line.

const PASSWORD = "correct-horse-battery-staple";
const COVERS = "The key and the model were checked.";

const imageType = (charged: boolean): AdapterTypeInfo => ({
  id: "fal-image",
  stage: "image",
  label: "Fal.ai",
  fields: [{ path: ["model"], label: "Model", kind: "text", required: true }],
  connectionCheck: { charged, covers: COVERS },
});

const baseProfile: ProfileView = {
  id: "Fal.ai",
  stage: "image",
  adapterType: "fal-image",
  label: "Fal.ai",
  parameters: { model: "fal-ai/flux/dev" },
  keyStatus: "stored",
  keyHint: "90ab",
  usable: true,
  problems: [],
  active: true,
  retired: false,
};
const noKey: ProfileView = { ...baseProfile, id: "01NOKEY", label: "Flux pro", keyStatus: "missing", keyHint: null, usable: false, active: false };

type Call = { url: string; method: string; body?: unknown };
function stubBackend(options: { charged?: boolean; answer?: () => Response } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === `${API_BASE}/admin/provider-types`) return Promise.resolve(new Response(JSON.stringify({ types: [imageType(options.charged ?? false)] }), { status: 200 }));
      if (url === `${API_BASE}/admin/provider-profiles` && method === "GET") return Promise.resolve(new Response(JSON.stringify({ profiles: [baseProfile, noKey] }), { status: 200 }));
      if (url.endsWith("/test") && method === "POST") return Promise.resolve(options.answer ? options.answer() : new Response(JSON.stringify({ outcome: "connected", covers: COVERS }), { status: 200 }));
      return Promise.resolve(new Response("{}", { status: 404 }));
    }),
  );
  return calls;
}
const testCalls = (calls: Call[]) => calls.filter((call) => call.url.endsWith("/test"));
const answer = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

async function open(onDenied: () => void = () => undefined) {
  render(<ProviderProfilesSection password={PASSWORD} onDenied={onDenied} onChanged={() => undefined} />);
  return screen.findByRole("button", { name: "Test connection Fal.ai" });
}

describe("Test connection", () => {
  it("is offered for a profile with a key and not for one without", async () => {
    stubBackend();
    await open();
    expect(screen.queryByRole("button", { name: "Test connection Flux pro" })).not.toBeInTheDocument();
  });

  it("sends a free check at once, with no confirmation, and shows the result and what it covered", async () => {
    const calls = stubBackend();
    await userEvent.click(await open());
    expect(await screen.findByText(/Connected/)).toBeInTheDocument();
    expect(screen.getByText(COVERS)).toBeInTheDocument();
    expect(testCalls(calls)).toEqual([{ url: `${API_BASE}/admin/provider-profiles/Fal.ai/test`, method: "POST", body: {} }]);
  });

  it.each([
    [{ outcome: "key-rejected" }, /key was rejected/i],
    [{ outcome: "not-found" }, /model or voice was not found/i],
    [{ outcome: "unreachable" }, /could not be reached/i],
    [{ outcome: "unexpected", httpStatus: 502 }, /unexpected answer.*502/i],
    [{ outcome: "no-key" }, /has no key/i],
  ])("shows %j in words", async (result, sentence) => {
    stubBackend({ answer: answer({ ...result, covers: COVERS }) });
    await userEvent.click(await open());
    expect(await screen.findByText(sentence)).toBeInTheDocument();
  });

  it("is disabled while a test runs, so one click sends one request", async () => {
    let finish: (response: Response) => void = () => undefined;
    const calls = stubBackend();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (!url.endsWith("/test")) return original(url, init);
      calls.push({ url, method: "POST" });
      return new Promise<Response>((resolve) => (finish = resolve));
    });
    const button = await open();
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await userEvent.click(button);
    finish(new Response(JSON.stringify({ outcome: "connected", covers: COVERS })));
    await waitFor(() => expect(button).toBeEnabled());
    expect(testCalls(calls)).toHaveLength(1);
  });

  it("is disabled while the profile's form is open with unsaved changes", async () => {
    stubBackend();
    const button = await open();
    await userEvent.click(screen.getByRole("button", { name: "Edit Fal.ai" }));
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(button).toBeEnabled();
  });

  it("locks the page again when the password is refused", async () => {
    stubBackend({ answer: answer({ statusCode: 401 }, 401) });
    const onDenied = vi.fn();
    await userEvent.click(await open(onDenied));
    await waitFor(() => expect(onDenied).toHaveBeenCalled());
  });

  it("never shows anything the closed result does not carry", async () => {
    stubBackend({ answer: answer({ outcome: "key-rejected", covers: COVERS, detail: "sk-example-1234567890ab" }) });
    await userEvent.click(await open());
    await screen.findByText(/key was rejected/i);
    expect(document.body).not.toHaveTextContent("sk-example-1234567890ab");
  });
});

describe("a charged check", () => {
  it("shows the charge notice first and sends nothing until the Administrator confirms", async () => {
    const calls = stubBackend({ charged: true });
    await userEvent.click(await open());
    expect(screen.getByText(/charged by Fal\.ai/i)).toBeInTheDocument();
    expect(testCalls(calls)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Send charged test of Fal.ai" }));
    await screen.findByText(/Connected/);
    expect(testCalls(calls)).toEqual([{ url: `${API_BASE}/admin/provider-profiles/Fal.ai/test`, method: "POST", body: { acceptCharge: true } }]);
  });

  it("sends nothing when the Administrator cancels", async () => {
    const calls = stubBackend({ charged: true });
    await userEvent.click(await open());
    await userEvent.click(screen.getByRole("button", { name: "Cancel test of Fal.ai" }));
    expect(screen.queryByText(/charged by Fal\.ai/i)).not.toBeInTheDocument();
    expect(testCalls(calls)).toHaveLength(0);
  });
});
