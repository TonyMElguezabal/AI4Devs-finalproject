import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../src/api/client";
import { ActiveProvidersSection } from "../src/components/ActiveProvidersSection";
import type { ProviderView } from "../src/types";

// change-active-provider-from-admin (JOS-171), group 6 — design Decision 6; spec "The Administrator sees the
// active provider and its source". `fetch` is mocked with the backend's `/admin/providers` answers.

const PASSWORD = "correct-horse-battery-staple";

const view = (stage: ProviderView["stage"], overrides: Partial<ProviderView> = {}): ProviderView => ({
  stage,
  activeProviderId: `${stage}-default`,
  activeLabel: `${stage} default`,
  source: "settings",
  selectable: [{ id: `${stage}-default`, label: `${stage} default` }],
  orphanedChoice: null,
  ...overrides,
});

const twoVideoOptions = [
  { id: "video-default", label: "Video default" },
  { id: "stub-b", label: "Stub B" },
];

function initialViews(): ProviderView[] {
  return [
    view("reasoning"),
    view("voice"),
    view("alignment"),
    view("image"),
    view("video", { activeLabel: "Video default", activeProviderId: "video-default", selectable: twoVideoOptions }),
  ];
}

type Call = { url: string; init?: RequestInit };

function stubBackend(options: { put?: (stage: string, providerId: string) => Response } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === `${API_BASE}/admin/providers` && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ providers: initialViews() }), { status: 200 });
      const put = /\/admin\/providers\/(\w+)$/.exec(url);
      if (put && init?.method === "PUT") {
        const { providerId } = JSON.parse(String(init.body));
        return options.put ? options.put(put[1]!, providerId) : new Response(JSON.stringify(view("video", { activeProviderId: providerId, activeLabel: "Stub B", source: "admin", selectable: twoVideoOptions })), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("ActiveProvidersSection", () => {
  it("shows one row per stage with its select set to the active provider and its source", async () => {
    stubBackend();
    render(<ActiveProvidersSection password={PASSWORD} onDenied={() => undefined} />);

    const section = await screen.findByRole("region", { name: "Active providers" });
    for (const name of ["Reasoning", "Voice", "Alignment", "Image", "Video"]) {
      expect(within(section).getByRole("combobox", { name: `${name} provider` })).toBeInTheDocument();
    }
    expect(within(section).getByRole("combobox", { name: "Video provider" })).toHaveValue("video-default");
    expect(within(section).getAllByText("from settings files")).toHaveLength(5);
  });

  it("sends the Administrator password with every request", async () => {
    const calls = stubBackend();
    render(<ActiveProvidersSection password={PASSWORD} onDenied={() => undefined} />);
    await screen.findByRole("region", { name: "Active providers" });
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe(`Bearer ${PASSWORD}`);
  });

  it("shows a stage with a single option as a disabled select", async () => {
    stubBackend();
    render(<ActiveProvidersSection password={PASSWORD} onDenied={() => undefined} />);
    expect(await screen.findByRole("combobox", { name: "Voice provider" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Video provider" })).toBeEnabled();
  });

  it("sends the PUT when a select changes and shows the returned view", async () => {
    const calls = stubBackend();
    const user = userEvent.setup();
    render(<ActiveProvidersSection password={PASSWORD} onDenied={() => undefined} />);

    await user.selectOptions(await screen.findByRole("combobox", { name: "Video provider" }), "stub-b");

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Video provider" })).toHaveValue("stub-b"));
    const put = calls.find((call) => call.init?.method === "PUT")!;
    expect(put.url).toBe(`${API_BASE}/admin/providers/video`);
    expect(JSON.parse(String(put.init!.body))).toEqual({ providerId: "stub-b" });
    expect(screen.getByText("set on /admin")).toBeInTheDocument();
  });

  it("shows an error and keeps the previous value when the change is refused with 400", async () => {
    stubBackend({ put: () => new Response(JSON.stringify({ ok: false, reason: "not-selectable", selectable: ["video-default"] }), { status: 400 }) });
    const user = userEvent.setup();
    render(<ActiveProvidersSection password={PASSWORD} onDenied={() => undefined} />);

    await user.selectOptions(await screen.findByRole("combobox", { name: "Video provider" }), "stub-b");

    expect(await screen.findByRole("alert")).toHaveTextContent(/Video/);
    expect(screen.getByRole("combobox", { name: "Video provider" })).toHaveValue("video-default");
  });

  it("locks the page again when the change is refused with 401", async () => {
    const onDenied = vi.fn();
    stubBackend({ put: () => new Response(JSON.stringify({ ok: false, reason: "wrong-password" }), { status: 401 }) });
    const user = userEvent.setup();
    render(<ActiveProvidersSection password={PASSWORD} onDenied={onDenied} />);

    await user.selectOptions(await screen.findByRole("combobox", { name: "Video provider" }), "stub-b");

    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("combobox", { name: "Video provider" })).toHaveValue("video-default");
  });

  it("reloads the selectors when a provider was added, edited or deleted (refreshKey changes)", async () => {
    const calls = stubBackend();
    const { rerender } = render(<ActiveProvidersSection password={PASSWORD} onDenied={() => undefined} refreshKey={0} />);
    await screen.findByRole("region", { name: "Active providers" });
    const loads = () => calls.filter((call) => call.url === `${API_BASE}/admin/providers`).length;
    expect(loads()).toBe(1);

    rerender(<ActiveProvidersSection password={PASSWORD} onDenied={() => undefined} refreshKey={1} />);

    await waitFor(() => expect(loads()).toBe(2));
  });
});
