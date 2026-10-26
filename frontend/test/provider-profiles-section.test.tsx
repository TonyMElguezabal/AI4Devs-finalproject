import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../src/api/client";
import { ProviderProfilesSection } from "../src/components/ProviderProfilesSection";
import type { AdapterTypeInfo, ProfileView } from "../src/types";

// manage-providers-from-admin (JOS-218), group 7 — design Decision 10. `fetch` is mocked with the backend's answers.

const PASSWORD = "correct-horse-battery-staple";

const imageType: AdapterTypeInfo = {
  id: "fal-image",
  stage: "image",
  label: "Fal.ai",
  fields: [
    { path: ["model"], label: "Model", kind: "text", required: true, help: "For example fal-ai/flux/dev." },
    { path: ["pricePerUnit"], label: "Price per image", kind: "number", required: false },
    { path: ["priceCurrency"], label: "Currency", kind: "text", required: false },
  ],
};
const videoType: AdapterTypeInfo = {
  id: "runninghub-video",
  stage: "video",
  label: "RunningHub",
  fields: [
    { path: ["endpoint"], label: "Endpoint path", kind: "text", required: true },
    { path: ["admittedDurationSeconds", "min"], label: "Shortest clip (seconds)", kind: "number", required: true },
    { path: ["admittedDurationSeconds", "max"], label: "Longest clip (seconds)", kind: "number", required: true },
  ],
};
const voiceType: AdapterTypeInfo = {
  id: "elevenlabs-voice",
  stage: "voice",
  label: "ElevenLabs",
  fields: [
    { path: ["speed"], label: "Speed", kind: "text", required: true, acceptsNumber: true },
    { path: ["pricePerUnit"], label: "Price per voice character", kind: "number", required: false },
    { path: ["priceCurrency"], label: "Currency", kind: "text", required: false },
  ],
};

const profile = (overrides: Partial<ProfileView> & Pick<ProfileView, "id" | "stage" | "adapterType" | "label">): ProfileView => ({
  parameters: {},
  keyStatus: "stored",
  keyHint: "90ab",
  usable: true,
  problems: [],
  active: false,
  retired: false,
  ...overrides,
});

const fal = profile({ id: "Fal.ai", stage: "image", adapterType: "fal-image", label: "Fal.ai", parameters: { model: "fal-ai/flux/dev" }, active: true });
const noKey = profile({
  id: "01NOKEY",
  stage: "image",
  adapterType: "fal-image",
  label: "Flux pro",
  parameters: { model: "fal-ai/flux-pro" },
  keyStatus: "missing",
  keyHint: null,
  usable: false,
  problems: [{ field: "apiKey", message: "apiKey: no API key is stored or found for this provider" }],
});
const video = profile({ id: "RunningHub", stage: "video", adapterType: "runninghub-video", label: "RunningHub", parameters: { endpoint: "/x", admittedDurationSeconds: { min: 5, max: 15 } }, keyStatus: "environment", keyHint: null, active: true });
const voice = profile({ id: "ElevenLabs", stage: "voice", adapterType: "elevenlabs-voice", label: "ElevenLabs", parameters: { speed: "default" }, active: true });

type Call = { url: string; method: string; body?: unknown; authorization: string | null };
function stubBackend(options: { profiles?: ProfileView[]; onWrite?: (call: Call) => Response } = {}) {
  const calls: Call[] = [];
  let profiles = options.profiles ?? [voice, fal, noKey, video];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const call: Call = { url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, authorization: new Headers(init?.headers).get("authorization") };
      calls.push(call);
      if (url === `${API_BASE}/admin/provider-types`) return new Response(JSON.stringify({ types: [imageType, videoType, voiceType] }), { status: 200 });
      if (url === `${API_BASE}/admin/provider-profiles` && method === "GET") return new Response(JSON.stringify({ profiles }), { status: 200 });
      if (method !== "GET" && options.onWrite) {
        const response = options.onWrite(call);
        if (response.ok) {
          // The list the next GET returns changes with the write, as the backend's would.
          if (method === "POST") profiles = [...profiles, profile({ id: "01NEW", stage: "image", adapterType: "fal-image", label: String((call.body as { label: string }).label), parameters: (call.body as { parameters: Record<string, unknown> }).parameters, keyHint: "wxyz" })];
          if (method === "DELETE") profiles = profiles.filter((p) => !url.endsWith(`/${p.id}`));
        }
        return response;
      }
      return new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const section = () => screen.findByRole("region", { name: "Providers" });

describe("ProviderProfilesSection", () => {
  it("lists each stage's profiles with the adapter type, the key status and hint, and the reason a profile is not usable", async () => {
    stubBackend();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    const imageGroup = within(await screen.findByRole("group", { name: "Image providers" }));
    const falItem = imageGroup.getByRole("listitem", { name: "Fal.ai provider" });
    expect(falItem).toHaveTextContent("Fal.ai");
    expect(falItem).toHaveTextContent("Key stored (…90ab)");
    expect(falItem).toHaveTextContent("Active");
    const noKeyItem = imageGroup.getByRole("listitem", { name: "Flux pro provider" });
    expect(noKeyItem).toHaveTextContent("Key missing");
    expect(noKeyItem).toHaveTextContent("no API key is stored or found for this provider");
    expect(within(await screen.findByRole("group", { name: "Video providers" })).getByRole("listitem", { name: "RunningHub provider" })).toHaveTextContent("Key from the environment");
    await section();
  });

  it("reloads the list when the active provider changed (refreshKey changes)", async () => {
    const calls = stubBackend();
    const { rerender } = render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} refreshKey={0} />);
    await section();
    const loads = () => calls.filter((call) => call.url === `${API_BASE}/admin/provider-profiles` && call.method === "GET").length;
    expect(loads()).toBe(1);
    rerender(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} refreshKey={1} />);
    await waitFor(() => expect(loads()).toBe(2));
  });

  it("sends the password with every request", async () => {
    const calls = stubBackend();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);
    await section();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.authorization === `Bearer ${PASSWORD}`)).toBe(true);
  });

  it("adds a provider through a form built from the adapter type, with an empty password-type key field, and refreshes the list", async () => {
    const onChanged = vi.fn();
    const calls = stubBackend({ onWrite: () => new Response(JSON.stringify({ id: "01NEW" }), { status: 201 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={onChanged} />);

    await user.click(await screen.findByRole("button", { name: "Add image provider" }));
    const form = screen.getByRole("form", { name: "Add image provider" });
    const keyField = within(form).getByLabelText("API key");
    expect(keyField).toHaveAttribute("type", "password");
    expect(keyField).toHaveValue("");
    await user.type(within(form).getByLabelText("Name"), "Flux schnell");
    await user.type(within(form).getByLabelText("Model"), "fal-ai/flux/schnell");
    await user.type(keyField, "sk-example-1234567890wxyz");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.url).toBe(`${API_BASE}/admin/provider-profiles`);
    expect(post.body).toEqual({ stage: "image", adapterType: "fal-image", label: "Flux schnell", parameters: { model: "fal-ai/flux/schnell" }, apiKey: "sk-example-1234567890wxyz" });
    expect(screen.queryByRole("form", { name: "Add image provider" })).toBeNull();
    expect(await screen.findByRole("listitem", { name: "Flux schnell provider" })).toBeInTheDocument();
  });

  it("shows every listed problem and keeps the input when a save is refused with 400", async () => {
    stubBackend({
      onWrite: () => new Response(JSON.stringify({ ok: false, problems: [{ field: "label", message: "label: must not be empty" }, { field: "model", message: "model: must be a model identifier, not a URL" }] }), { status: 400 }),
    });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Add image provider" }));
    const form = screen.getByRole("form", { name: "Add image provider" });
    await user.type(within(form).getByLabelText("Model"), "https://evil.example");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    const alert = await within(form).findByRole("alert");
    expect(alert).toHaveTextContent("label: must not be empty");
    expect(alert).toHaveTextContent("model: must be a model identifier, not a URL");
    expect(within(form).getByLabelText("Model")).toHaveValue("https://evil.example");
  });

  it("edits a provider: shows its parameters, starts with an empty key, and sends no apiKey when it stays empty", async () => {
    const calls = stubBackend({ onWrite: () => new Response("{}", { status: 200 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Edit Fal.ai" }));
    const form = screen.getByRole("form", { name: "Edit image provider Fal.ai" });
    expect(within(form).getByLabelText("Model")).toHaveValue("fal-ai/flux/dev");
    expect(within(form).getByLabelText("API key")).toHaveValue("");
    const model = within(form).getByLabelText("Model");
    await user.clear(model);
    await user.type(model, "fal-ai/flux/pro");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    const put = calls.find((call) => call.method === "PUT")!;
    expect(put.url).toBe(`${API_BASE}/admin/provider-profiles/Fal.ai`);
    expect(put.body).toEqual({ label: "Fal.ai", parameters: { model: "fal-ai/flux/pro" } });
  });

  it("sends numbers as numbers and lets the voice speed be default or a number", async () => {
    const calls = stubBackend({ onWrite: () => new Response("{}", { status: 200 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Edit RunningHub" }));
    let form = screen.getByRole("form", { name: "Edit video provider RunningHub" });
    const max = within(form).getByLabelText("Longest clip (seconds)");
    await user.clear(max);
    await user.type(max, "12");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1));
    expect(calls.find((call) => call.method === "PUT")!.body).toMatchObject({ parameters: { endpoint: "/x", admittedDurationSeconds: { min: 5, max: 12 } } });

    await user.click(await screen.findByRole("button", { name: "Edit ElevenLabs" }));
    form = screen.getByRole("form", { name: "Edit voice provider ElevenLabs" });
    const speed = within(form).getByLabelText("Speed");
    await user.clear(speed);
    await user.type(speed, "1.1");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.filter((call) => call.method === "PUT")).toHaveLength(2));
    expect(calls.filter((call) => call.method === "PUT")[1]!.body).toMatchObject({ parameters: { speed: 1.1 } });
  });

  it("asks for confirmation before deleting, and tells that a provider with bound work was retired", async () => {
    const calls = stubBackend({ onWrite: () => new Response(JSON.stringify({ result: "retired" }), { status: 200 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Delete Flux pro" }));
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Confirm delete Flux pro" }));

    await waitFor(() => expect(calls.find((call) => call.method === "DELETE")?.url).toBe(`${API_BASE}/admin/provider-profiles/01NOKEY`));
    expect(await screen.findByRole("status")).toHaveTextContent(/retired/i);
  });

  it("shows the stage when deleting the active provider is refused with 409", async () => {
    stubBackend({ onWrite: () => new Response(JSON.stringify({ ok: false, reason: "active", stage: "image" }), { status: 409 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Delete Fal.ai" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete Fal.ai" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/active image provider/i);
  });

  it("locks the page again when a request is refused with 401", async () => {
    const onDenied = vi.fn();
    stubBackend({ onWrite: () => new Response(JSON.stringify({ ok: false, reason: "wrong-password" }), { status: 401 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={onDenied} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Delete Flux pro" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete Flux pro" }));

    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
  });
});

// add-provider-price-per-unit (JOS-226), group 4 — design Decision 4: the optional price fields.
describe("the optional price fields", () => {
  it("shows 'Price per <unit>' and 'Currency' on the add form of a stage, and sends no price keys when both are empty", async () => {
    const calls = stubBackend({ onWrite: () => new Response(JSON.stringify({ id: "01NEW" }), { status: 201 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Add image provider" }));
    const form = screen.getByRole("form", { name: "Add image provider" });
    expect(within(form).getByLabelText("Price per image")).toHaveValue("");
    expect(within(form).getByLabelText("Currency")).toHaveValue("");
    await user.type(within(form).getByLabelText("Name"), "Flux schnell");
    await user.type(within(form).getByLabelText("Model"), "fal-ai/flux/schnell");
    await user.type(within(form).getByLabelText("API key"), "sk-example-1234567890wxyz");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    expect((calls.find((call) => call.method === "POST")!.body as { parameters: unknown }).parameters).toEqual({ model: "fal-ai/flux/schnell" });
  });

  it("sends a price as a number with its currency", async () => {
    const calls = stubBackend({ onWrite: () => new Response(JSON.stringify({ id: "01NEW" }), { status: 201 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Add image provider" }));
    const form = screen.getByRole("form", { name: "Add image provider" });
    await user.type(within(form).getByLabelText("Name"), "Flux schnell");
    await user.type(within(form).getByLabelText("Model"), "fal-ai/flux/schnell");
    await user.type(within(form).getByLabelText("Price per image"), "0.04");
    await user.type(within(form).getByLabelText("Currency"), "usd");
    await user.type(within(form).getByLabelText("API key"), "sk-example-1234567890wxyz");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    expect((calls.find((call) => call.method === "POST")!.body as { parameters: unknown }).parameters).toEqual({ model: "fal-ai/flux/schnell", pricePerUnit: 0.04, priceCurrency: "usd" });
  });

  it("shows the stored price on the edit form, and clearing both fields saves without price keys", async () => {
    const priced = profile({ ...fal, parameters: { model: "fal-ai/flux/dev", pricePerUnit: 0.04, priceCurrency: "USD" } });
    const calls = stubBackend({ profiles: [priced], onWrite: () => new Response("{}", { status: 200 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Edit Fal.ai" }));
    const form = screen.getByRole("form", { name: "Edit image provider Fal.ai" });
    expect(within(form).getByLabelText("Price per image")).toHaveValue("0.04");
    expect(within(form).getByLabelText("Currency")).toHaveValue("USD");
    await user.clear(within(form).getByLabelText("Price per image"));
    await user.clear(within(form).getByLabelText("Currency"));
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    expect(calls.find((call) => call.method === "PUT")!.body).toEqual({ label: "Fal.ai", parameters: { model: "fal-ai/flux/dev" } });
  });

  it("shows a refused price and keeps the input", async () => {
    stubBackend({ onWrite: () => new Response(JSON.stringify({ ok: false, problems: [{ field: "pricePerUnit", message: "pricePerUnit: must be at least 0" }] }), { status: 400 }) });
    const user = userEvent.setup();
    render(<ProviderProfilesSection password={PASSWORD} onDenied={() => undefined} onChanged={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Add image provider" }));
    const form = screen.getByRole("form", { name: "Add image provider" });
    await user.type(within(form).getByLabelText("Price per image"), "-1");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent("pricePerUnit: must be at least 0");
    expect(within(form).getByLabelText("Price per image")).toHaveValue("-1");
  });
});
