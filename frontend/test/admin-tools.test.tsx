import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTools } from "../src/components/AdminTools";

// admin-tabs-and-tables (JOS-270), group 1 — the tabs of `/admin`. The sections are stand-ins: only the tabs are under test.
vi.mock("../src/components/VisualStyleSection", () => ({ VisualStyleSection: () => <section aria-label="Visual style" /> }));
vi.mock("../src/components/ActiveProvidersSection", () => ({ ActiveProvidersSection: () => <section aria-label="Active providers" /> }));
vi.mock("../src/components/ProviderProfilesSection", () => ({ ProviderProfilesSection: () => <section aria-label="Providers" /> }));
vi.mock("../src/components/FailedStagesSection", () => ({ FailedStagesSection: () => <section aria-label="Failed stages" /> }));
const reportsMounted = vi.fn();
vi.mock("../src/components/ReportsSection", () => ({
  ReportsSection: ({ onDenied }: { onDenied: () => void }) => {
    reportsMounted();
    return <button onClick={onDenied}>Refuse</button>;
  },
}));

const context = { password: "secret", onDenied: vi.fn() };

beforeEach(() => {
  window.location.hash = "";
  reportsMounted.mockClear();
});
afterEach(() => {
  window.location.hash = "";
});

describe("AdminTools tabs", () => {
  it("selects Settings first and shows the visual style and the active providers", () => {
    render(<AdminTools {...context} />);
    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Visual style" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Active providers" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Providers" })).not.toBeInTheDocument();
  });

  it("shows only the chosen tab and writes it to the hash", async () => {
    render(<AdminTools {...context} />);
    await userEvent.click(screen.getByRole("tab", { name: "Reports" }));
    expect(window.location.hash).toBe("#reports");
    expect(screen.getByRole("button", { name: "Refuse" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Visual style" })).not.toBeInTheDocument();
  });

  it("selects the tab named by the hash on load", () => {
    window.location.hash = "#providers";
    render(<AdminTools {...context} />);
    expect(screen.getByRole("tab", { name: "Providers" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Providers" })).toBeInTheDocument();
  });

  it("falls back to Settings for an unknown hash", () => {
    window.location.hash = "#unknown";
    render(<AdminTools {...context} />);
    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
  });

  it("does not mount the reports until the Reports tab is chosen", async () => {
    render(<AdminTools {...context} />);
    expect(reportsMounted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Reports" }));
    expect(reportsMounted).toHaveBeenCalled();
  });

  it("passes a refusal from any tab to the page", async () => {
    const onDenied = vi.fn();
    render(<AdminTools password="secret" onDenied={onDenied} />);
    await userEvent.click(screen.getByRole("tab", { name: "Reports" }));
    await userEvent.click(screen.getByRole("button", { name: "Refuse" }));
    expect(onDenied).toHaveBeenCalled();
  });

  it("moves between tabs with the arrow keys", async () => {
    render(<AdminTools {...context} />);
    screen.getByRole("tab", { name: "Settings" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Providers" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Reports" })).toHaveAttribute("aria-selected", "true");
  });
});
