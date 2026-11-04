import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportFrontendError } from "../src/api/client";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { installGlobalErrorReporting } from "../src/errorReporting";

// cover-error-reporting (JOS-254), design D3 — uncaught errors, unhandled rejections and render errors are sent to
// POST /telemetry/frontend-errors with only kind, message and stack; a render error shows a fallback.

type Call = { url: string; init?: RequestInit };

function stubFetch(answer: () => Promise<Response> = async () => new Response(null, { status: 204 })): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => (calls.push({ url, init }), answer())));
  return calls;
}

const bodyOf = (call: Call) => JSON.parse(String(call.init?.body)) as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reportFrontendError", () => {
  it("posts only kind, message and stack", async () => {
    const calls = stubFetch();
    const error = new TypeError("x is undefined");

    await reportFrontendError("error", error);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/telemetry\/frontend-errors$/);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.keepalive).toBe(true);
    expect(Object.keys(bodyOf(calls[0]!)).sort()).toEqual(["kind", "message", "stack"]);
    expect(bodyOf(calls[0]!)).toMatchObject({ kind: "error", message: "x is undefined" });
  });

  it("cuts the message to 1000 and the stack to 8000 characters", async () => {
    const calls = stubFetch();
    const error = new Error("m".repeat(5000));
    error.stack = "s".repeat(9000);

    await reportFrontendError("render", error);

    expect(bodyOf(calls[0]!).message).toBe("m".repeat(1000));
    expect(bodyOf(calls[0]!).stack).toBe("s".repeat(8000));
  });

  it("sends a reason that is not an Error as its String() value, with no stack", async () => {
    const calls = stubFetch();

    await reportFrontendError("unhandledrejection", "boom");

    expect(bodyOf(calls[0]!)).toEqual({ kind: "unhandledrejection", message: "boom" });
  });

  it("never throws and sends nothing more when the request fails", async () => {
    const calls = stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(reportFrontendError("error", new Error("boom"))).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});

describe("installGlobalErrorReporting", () => {
  it("reports an uncaught error and an unhandled rejection with their kinds", () => {
    const target = new EventTarget();
    const report = vi.fn();
    installGlobalErrorReporting(target, report);

    const error = new Error("thrown");
    target.dispatchEvent(Object.assign(new Event("error"), { error, message: "Uncaught Error: thrown" }));
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "rejected" }));

    expect(report).toHaveBeenNthCalledWith(1, "error", error);
    expect(report).toHaveBeenNthCalledWith(2, "unhandledrejection", "rejected");
  });

  it("falls back to the event message when an error event carries no error (a cross-origin script)", () => {
    const target = new EventTarget();
    const report = vi.fn();
    installGlobalErrorReporting(target, report);

    target.dispatchEvent(Object.assign(new Event("error"), { error: null, message: "Script error." }));

    expect(report).toHaveBeenCalledWith("error", "Script error.");
  });
});

function Broken(): never {
  throw new Error("render failed");
}

describe("ErrorBoundary", () => {
  it("shows the fallback instead of a blank page and reports one render error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // React logs the caught error
    const report = vi.fn();

    render(
      <ErrorBoundary report={report}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("render", expect.objectContaining({ message: "render failed" }));
  });

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary report={vi.fn()}>
        <p>fine</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("reloads the page from the keyboard", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    render(
      <ErrorBoundary report={vi.fn()} reload={reload}>
        <Broken />
      </ErrorBoundary>,
    );

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Reload" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
