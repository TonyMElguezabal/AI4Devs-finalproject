import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../src/api/client";
import { ProviderProfilesSection } from "../src/components/ProviderProfilesSection";
import type { AdapterTypeInfo, ProfileView } from "../src/types";

// configurable-video-connector (JOS-219), task 4.1 — the /admin form of a configured video connector: the JSON field of
// its requests, "Duplicate" for another model with the same key, and the warning that a new host clears the key.

const PASSWORD = "correct-horse-battery-staple";

const connectorType: AdapterTypeInfo = {
  id: "configured-video",
  stage: "video",
  label: "Configured connector",
  fields: [
    { path: ["baseUrl"], label: "Base URL", kind: "text", required: true },
    { path: ["model"], label: "Model", kind: "text", required: true },
    { path: ["resolution"], label: "Clip resolution", kind: "text", required: true },
    { path: ["admittedDurationSeconds", "min"], label: "Shortest clip (seconds)", kind: "number", required: true },
    { path: ["admittedDurationSeconds", "max"], label: "Longest clip (seconds)", kind: "number", required: true },
    { path: ["requests"], label: "Requests (JSON)", kind: "json", required: true },
  ],
  connectionCheck: { charged: false, covers: "Only the key was checked. The model and the requests were not." },
};

const REQUESTS = { headers: { Authorization: "Bearer {key}" }, submit: { path: "/v1/image_to_video", taskIdAt: "id" } };
const wan: ProfileView = {
  id: "01WAN",
  stage: "video",
  adapterType: "configured-video",
  label: "Runway Wan",
  parameters: { baseUrl: "https://api.dev.runwayml.com", model: "wan3", resolution: "auto_720p", admittedDurationSeconds: { min: 5, max: 15 }, requests: REQUESTS },
  keyStatus: "stored",
  keyHint: "abcd",
  usable: true,
  problems: [],
  active: false,
  retired: false,
};

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stubBackend(options: { write?: (call: Call) => Response; testResult?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const call: Call = { url, method, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined };
      calls.push(call);
      if (url === `${API_BASE}/admin/provider-types`) return new Response(JSON.stringify({ types: [connectorType] }), { status: 200 });
      if (url === `${API_BASE}/admin/provider-profiles` && method === "GET") return new Response(JSON.stringify({ profiles: [wan] }), { status: 200 });
      if (url.endsWith("/test")) return new Response(JSON.stringify(options.testResult ?? { outcome: "connected", covers: "" }), { status: 200 });
      if (options.write) return options.write(call);
      return new Response(JSON.stringify({ ...wan, id: "01NEW" }), { status: 201 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const renderSection = () => render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

describe("the configured connector form", () => {
  it("shows the requests as formatted JSON in a text area, and sends them as an object", async () => {
    const calls = stubBackend({ write: () => new Response(JSON.stringify(wan), { status: 200 }) });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit Runway Wan" }));
    const form = screen.getByRole("form", { name: "Edit video provider Runway Wan" });
    const requests = within(form).getByLabelText("Requests (JSON)");
    expect(requests.tagName).toBe("TEXTAREA");
    expect(requests).toHaveValue(JSON.stringify(REQUESTS, null, 2));
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    expect(calls.find((call) => call.method === "PUT")!.body!.parameters).toMatchObject({ requests: REQUESTS, admittedDurationSeconds: { min: 5, max: 15 } });
  });

  it("refuses requests that are not JSON before sending anything", async () => {
    const calls = stubBackend();
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit Runway Wan" }));
    const form = screen.getByRole("form", { name: "Edit video provider Runway Wan" });
    const requests = within(form).getByLabelText("Requests (JSON)");
    await user.clear(requests);
    await user.type(requests, "not json");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent("Requests (JSON) is not valid JSON");
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("shows the server's problems with their path inside the requests", async () => {
    stubBackend({ write: () => new Response(JSON.stringify({ ok: false, problems: [{ field: "requests.poll.statusAt", message: "requests.poll.statusAt: is required" }] }), { status: 400 }) });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit Runway Wan" }));
    const form = screen.getByRole("form", { name: "Edit video provider Runway Wan" });
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent("requests.poll.statusAt: is required");
  });

  it("duplicates a connector into the add form, without its key, and reuses the key when asked", async () => {
    const calls = stubBackend();
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Duplicate Runway Wan" }));
    const form = screen.getByRole("form", { name: "Add video provider" });
    expect(within(form).getByLabelText("Name")).toHaveValue("Runway Wan (copy)");
    expect(within(form).getByLabelText("Requests (JSON)")).toHaveValue(JSON.stringify(REQUESTS, null, 2));
    expect(within(form).getByLabelText("API key")).toHaveValue("");
    const reuse = within(form).getByRole("checkbox", { name: "Reuse the key of Runway Wan (…abcd)" });
    expect(reuse).toBeChecked();
    const model = within(form).getByLabelText("Model");
    await user.clear(model);
    await user.type(model, "kling_4");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    const post = calls.find((call) => call.method === "POST")!.body!;
    expect(post).toMatchObject({ stage: "video", adapterType: "configured-video", label: "Runway Wan (copy)", copyKeyFrom: "01WAN" });
    expect(post.apiKey).toBeUndefined();
    expect(post.parameters).toMatchObject({ model: "kling_4", requests: REQUESTS });
  });

  it("warns before saving that a new host clears the stored key, and says so after the save", async () => {
    stubBackend({ write: () => new Response(JSON.stringify({ ...wan, keyStatus: "missing", keyHint: null, keyCleared: true }), { status: 200 }) });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit Runway Wan" }));
    const form = screen.getByRole("form", { name: "Edit video provider Runway Wan" });
    expect(within(form).queryByText(/clears the stored key/)).toBeNull();
    const baseUrl = within(form).getByLabelText("Base URL");
    await user.clear(baseUrl);
    await user.type(baseUrl, "https://other.example");
    expect(within(form).getByText(/clears the stored key/)).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/The key of Runway Wan was cleared because its host changed/)).toBeInTheDocument();
  });

  it("says when a connector's definition has no connection check", async () => {
    stubBackend({ testResult: { outcome: "no-check", covers: "" } });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Test connection Runway Wan" }));

    expect(await screen.findByText("This connector's requests define no connection check, so nothing was sent.")).toBeInTheDocument();
  });
});
