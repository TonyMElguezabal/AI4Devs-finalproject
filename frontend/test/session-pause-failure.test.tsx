import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SessionHeader } from "../src/components/SessionHeader";
import { sessionPauseRefusalSentence } from "../src/pauseRefusals";
import type { SessionEventPayload } from "../src/types";

// surface-pause-continue-failure (JOS-217) — a failed pause or continue is a sentence, and the button is usable again.

function makeSession(overrides: Partial<SessionEventPayload>): SessionEventPayload {
  return {
    sessionId: "s1",
    state: "chunks-processing",
    paused: false,
    running: [],
    held: [],
    ...overrides,
  } as SessionEventPayload;
}

const never = () => new Promise<never>(() => {});

describe("sessionPauseRefusalSentence", () => {
  it("names a missing session for both actions", () => {
    expect(sessionPauseRefusalSentence("pause", "unknown session")).toBe("This session could not be found.");
    expect(sessionPauseRefusalSentence("continue", "unknown session")).toBe("This session could not be found.");
  });

  it("falls back to a fixed sentence and never shows the raw reason", () => {
    expect(sessionPauseRefusalSentence("pause", "Failed to fetch")).toBe("The session could not be paused.");
    expect(sessionPauseRefusalSentence("continue", "request failed with 500")).toBe("The session could not be continued.");
    expect(sessionPauseRefusalSentence("pause", "")).toBe("The session could not be paused.");
  });
});

describe("SessionHeader pause and continue failures", () => {
  it("shows a sentence and re-enables Pause when the pause request fails (AC1)", async () => {
    const user = userEvent.setup();
    render(<SessionHeader session={makeSession({})} onPause={() => Promise.reject(new TypeError("Failed to fetch"))} onContinue={async () => {}} />);

    await user.click(screen.getByRole("button", { name: "Pause session" }));

    expect(await screen.findByText("The session could not be paused.")).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause session" })).toBeEnabled();
  });

  it("shows a sentence and re-enables Continue when the continue request fails (AC2)", async () => {
    const user = userEvent.setup();
    render(<SessionHeader session={makeSession({ paused: true })} onPause={async () => {}} onContinue={() => Promise.reject(new TypeError("Failed to fetch"))} />);

    await user.click(screen.getByRole("button", { name: "Continue session" }));

    expect(await screen.findByText("The session could not be continued.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue session" })).toBeEnabled();
  });

  it("names a missing session when the backend refuses with unknown session", async () => {
    const user = userEvent.setup();
    render(<SessionHeader session={makeSession({})} onPause={() => Promise.reject(new Error("unknown session"))} onContinue={async () => {}} />);

    await user.click(screen.getByRole("button", { name: "Pause session" }));

    expect(await screen.findByText("This session could not be found.")).toBeInTheDocument();
  });

  it("disables the button while the request is outstanding", async () => {
    const user = userEvent.setup();
    render(<SessionHeader session={makeSession({})} onPause={never} onContinue={async () => {}} />);

    await user.click(screen.getByRole("button", { name: "Pause session" }));

    expect(screen.getByRole("button", { name: "Pause session" })).toBeDisabled();
  });

  it("shows no sentence after a successful request and leaves the state to the live update (AC3)", async () => {
    const user = userEvent.setup();
    let calls = 0;
    render(
      <SessionHeader
        session={makeSession({})}
        onPause={async () => {
          calls += 1;
        }}
        onContinue={async () => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Pause session" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Pause session" })).toBeEnabled());
    expect(calls).toBe(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Paused — waiting/)).not.toBeInTheDocument();
  });

  it("clears the previous sentence when the button is clicked again", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const onPause = () => (++attempt === 1 ? Promise.reject(new Error("boom")) : never());
    render(<SessionHeader session={makeSession({})} onPause={onPause} onContinue={async () => {}} />);

    await user.click(screen.getByRole("button", { name: "Pause session" }));
    expect(await screen.findByText("The session could not be paused.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause session" }));
    expect(screen.queryByText("The session could not be paused.")).not.toBeInTheDocument();
  });
});
