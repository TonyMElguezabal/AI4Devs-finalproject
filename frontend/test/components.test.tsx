import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SceneList } from "../src/components/SceneList";
import { SceneRow } from "../src/components/SceneRow";
import { SessionHeader } from "../src/components/SessionHeader";
import { FinalVideoDownload } from "../src/components/FinalVideoDownload";
import { StartProjectForm } from "../src/components/StartProjectForm";
import { SessionPage } from "../src/components/SessionPage";
import type { SceneEventPayload, SceneState, SessionEventPayload, SessionState } from "../src/types";
import { sceneStatusClass, sessionStatusClass } from "../src/styles/status";

function makeScene(overrides: Partial<SceneEventPayload>): SceneEventPayload {
  return {
    type: "scene",
    sessionId: "s1",
    sceneId: overrides.sceneId ?? "scene-x",
    index: overrides.index ?? 1,
    state: "submitted",
    provider: "stub-image-provider",
    attempts: 0,
    instruction: "",
    updatedAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionEventPayload>): SessionEventPayload {
  return {
    type: "session",
    sessionId: "s1",
    title: "A title",
    script: "A test script.",
    language: "en",
    state: "submitted",
    paused: false,
    updatedAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

// task 5.1/6.2 — Decision 6: render order from scene identifier, never arrival order.
describe("SceneList ordering (Decision 6)", () => {
  it("renders scenes in ascending index order regardless of array order", () => {
    const scenes = [
      makeScene({ sceneId: "c", index: 3 }),
      makeScene({ sceneId: "a", index: 1 }),
      makeScene({ sceneId: "b", index: 2 }),
    ];
    render(<SceneList sessionId="s1" scenes={scenes} onRetry={() => {}} onCorrect={() => {}} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Scene 1", "Scene 2", "Scene 3"]);
  });
});

// task 5.4/6.2 — Decision 4: the correction form is present only on a failed
// stage, absent (not disabled) otherwise, and never exposes id/prompt/order.
describe("Conditional editing (Decision 4)", () => {
  async function expandRow(sceneId: string) {
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: `View scene 1 details` });
    await user.click(toggle);
  }

  it("shows the correction form on a failed scene", async () => {
    const scene = makeScene({ sceneId: "f1", index: 1, state: "failed", errorCause: "stub: content-filter rejection" });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);
    await expandRow("f1");

    expect(screen.getByRole("form", { name: "Correct scene 1 image instruction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry scene 1" })).toBeInTheDocument();
  });

  it("does not render the correction form on a successful scene", async () => {
    const scene = makeScene({ sceneId: "ok1", index: 1, state: "chunk-complete", result: { imageUrl: "scene-1.png" } });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);
    await expandRow("ok1");

    expect(screen.queryByRole("form", { name: "Correct scene 1 image instruction" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry scene 1" })).not.toBeInTheDocument();
  });

  it("never renders an editable identifier, prompt-as-narration, or order field", async () => {
    const scene = makeScene({ sceneId: "f2", index: 1, state: "failed" });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);
    await expandRow("f2");

    // The only editable field is the image instruction textarea; scene id and
    // index are rendered as plain text/labels, never as <input>/<textarea>.
    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes).toHaveLength(1);
    expect(textboxes[0]).toHaveAccessibleName("Corrected image instruction for scene 1");
  });
});

// task 5.5/6.2 — download affordances gated by state.
describe("Download gating", () => {
  it("offers per-scene downloads only once the scene is chunk-complete", async () => {
    const user = userEvent.setup();
    const pending = makeScene({ sceneId: "p1", index: 1, state: "image-generating" });
    render(<SceneRow scene={pending} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="/img" videoDownloadUrl="/vid" />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));
    expect(screen.queryByRole("link", { name: /Download scene 1 image/ })).not.toBeInTheDocument();
  });

  it("offers per-scene downloads once complete", async () => {
    const user = userEvent.setup();
    const done = makeScene({ sceneId: "d1", index: 1, state: "chunk-complete", result: { imageUrl: "scene-1.png" } });
    render(<SceneRow scene={done} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="/img" videoDownloadUrl="/vid" />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));
    expect(screen.getByRole("link", { name: "Download scene 1 image" })).toHaveAttribute("href", "/img");
    expect(screen.getByRole("link", { name: "Download scene 1 video" })).toHaveAttribute("href", "/vid");
  });

  it("offers the final video only at final-video, never earlier", () => {
    const { rerender } = render(<FinalVideoDownload state="chunks-processing" url="/final" />);
    expect(screen.queryByRole("link", { name: "Download final video" })).not.toBeInTheDocument();

    rerender(<FinalVideoDownload state="failed" url="/final" />);
    expect(screen.queryByRole("link", { name: "Download final video" })).not.toBeInTheDocument();

    rerender(<FinalVideoDownload state="final-video" url="/final" />);
    expect(screen.getByRole("link", { name: "Download final video" })).toHaveAttribute("href", "/final");
  });
});

// record-speed-adjustment-factor (JOS-148), task 6.2 — the requested
// duration and speed factor shown in scene details (PRD §3/§7.2/AC23),
// which SceneRow.tsx's own comment had deferred to this story.
describe("Speed-adjustment factor in scene details (JOS-148)", () => {
  it("shows the requested duration and speed factor when present", async () => {
    const user = userEvent.setup();
    const scene = makeScene({ sceneId: "sf1", index: 1, state: "chunk-complete", requestedDurationSeconds: 15, speedFactor: 1.16 });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));

    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("1.16")).toBeInTheDocument();
  });

  it("shows the speed-factor warning distinguishably from a duration warning", async () => {
    const user = userEvent.setup();
    const scene = makeScene({
      sceneId: "sf2",
      index: 1,
      state: "chunk-complete",
      requestedDurationSeconds: 15,
      durationWarning: "exceeds-maximum",
      speedFactor: 2.33,
      speedFactorWarning: "exceeds-limit",
    });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));

    const durationWarning = screen.getByText(/exceeds-maximum/);
    const factorWarning = screen.getByText(/exceeds-limit/);
    expect(durationWarning).toBeInTheDocument();
    expect(factorWarning).toBeInTheDocument();
    expect(durationWarning).not.toBe(factorWarning);
  });

  it("shows neither the requested duration nor the speed factor for a skeleton scene", async () => {
    const user = userEvent.setup();
    const scene = makeScene({ sceneId: "sf3", index: 1, state: "submitted" });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));

    expect(screen.queryByText("Requested duration")).not.toBeInTheDocument();
    expect(screen.queryByText("Speed factor")).not.toBeInTheDocument();
  });
});

// task 6.3 — the accessible naming convention (Decision 5) itself, so drift
// breaks a test here rather than a later story's E2E.
describe("Accessible naming convention (Decision 5)", () => {
  it("gives every scene row and its actions stable, predictable names", () => {
    const scene = makeScene({ sceneId: "n1", index: 7, state: "failed" });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);

    expect(screen.getByRole("listitem", { name: "Scene 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View scene 7 details" })).toBeInTheDocument();
  });
});

// define-visual-design tasks 1.2/1.3 — every one of the 6 chunk states
// resolves to its mapped status class (Decision 2: one shared mapping, never
// a per-component literal), and the existing text label survives unchanged
// (Decision 3: color is additive, never a replacement for text).
describe("Scene status class mapping (define-visual-design, Decision 2)", () => {
  const ALL_SCENE_STATES: SceneState[] = [
    "submitted",
    "image-generating",
    "image-complete",
    "video-generating",
    "chunk-complete",
    "failed",
  ];

  for (const state of ALL_SCENE_STATES) {
    it(`renders scene state "${state}" with its mapped status class and unchanged text label`, () => {
      const scene = makeScene({ sceneId: `st-${state}`, index: 1, state });
      render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);

      const row = screen.getByRole("listitem", { name: "Scene 1" });
      expect(row.className.split(/\s+/)).toContain(sceneStatusClass(state));
      expect(screen.getByText(new RegExp(`— ${state}$`))).toBeInTheDocument();
    });
  }
});

// define-visual-design tasks 1.2/1.3 — same guarantee for the 8 session
// states, plus the paused marker (Decision: paused is never color-only).
describe("Session status class mapping (define-visual-design, Decision 2)", () => {
  const ALL_SESSION_STATES: SessionState[] = [
    "submitted",
    "voice-over-generating",
    "voice-over-complete",
    "chunk-decomposing",
    "chunks-processing",
    "final-video-generating",
    "final-video",
    "failed",
  ];

  for (const state of ALL_SESSION_STATES) {
    it(`renders session state "${state}" with its mapped status class and unchanged text label`, () => {
      const session = makeSession({ state });
      render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

      const section = screen.getByRole("region", { name: "Session status" });
      expect(section.className.split(/\s+/)).toContain(sessionStatusClass(state));
      expect(screen.getByText(new RegExp(state))).toBeInTheDocument();
    });
  }

  it("keeps the paused marker identifiable by text, not color alone", () => {
    const session = makeSession({ state: "chunks-processing", paused: true });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText(/paused/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue session" })).toBeInTheDocument();
  });
});

// define-visual-design task 1.4 — regression guard: applying status classes
// must not change any accessible name `define-frontend-stack` established.
describe("Styling does not regress accessible names (define-visual-design)", () => {
  it("keeps SceneRow's accessible names exactly as documented once status classes are applied", () => {
    const scene = makeScene({ sceneId: "acc1", index: 9, state: "failed" });
    render(<SceneRow scene={scene} onRetry={() => {}} onCorrect={() => {}} imageDownloadUrl="#" videoDownloadUrl="#" />);

    expect(screen.getByRole("listitem", { name: "Scene 9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View scene 9 details" })).toBeInTheDocument();
  });

  it("keeps SessionHeader's accessible names exactly as documented once status classes are applied", () => {
    const session = makeSession({ state: "chunks-processing" });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByRole("region", { name: "Session status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause session" })).toBeInTheDocument();
  });
});

// start-video-project (JOS-134) task 6.7 — the start form.
describe("StartProjectForm", () => {
  const languages = [
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
  ];

  it("populates the language selector from the languages prop, not a hardcoded list (Decision 5)", () => {
    render(<StartProjectForm onStart={() => {}} languages={languages} />);
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Español" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Français" })).not.toBeInTheDocument();
  });

  it("cannot be submitted without a language selected (AC05)", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartProjectForm onStart={onStart} languages={languages} />);
    await user.type(screen.getByLabelText("Title"), "My Trip");
    await user.type(screen.getByLabelText("Script"), "A wide shot of a harbor at dusk.");
    expect(screen.getByRole("button", { name: "Start project" })).toBeDisabled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("cannot be submitted with an empty title or an empty script (AC03)", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartProjectForm onStart={onStart} languages={languages} />);
    await user.selectOptions(screen.getByLabelText("Language"), "en");
    expect(screen.getByRole("button", { name: "Start project" })).toBeDisabled();
  });

  it("submits title, script and language once all three are provided", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartProjectForm onStart={onStart} languages={languages} />);
    await user.type(screen.getByLabelText("Title"), "My Trip");
    await user.type(screen.getByLabelText("Script"), "A wide shot of a harbor at dusk.");
    await user.selectOptions(screen.getByLabelText("Language"), "en");
    const submit = screen.getByRole("button", { name: "Start project" });
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    expect(onStart).toHaveBeenCalledWith({ title: "My Trip", script: "A wide shot of a harbor at dusk.", language: "en" });
  });
});

// consult-session (JOS-135) task 4 — the session page.
describe("SessionPage", () => {
  const noop = () => {};
  const baseProps = {
    sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    connected: true,
    notFound: false,
    onStartNew: noop,
    onPause: noop,
    onContinue: noop,
    onRetry: noop,
    onCorrect: noop,
  };

  it("shows title, script, state and available results for a session (4.1)", () => {
    const snapshot = {
      session: makeSession({ title: "My Trip", script: "A wide shot of a harbor.", state: "final-video" }),
      scenes: [],
    };
    render(<SessionPage {...baseProps} snapshot={snapshot} />);
    expect(screen.getByText("My Trip")).toBeInTheDocument();
    expect(screen.getByText("A wide shot of a harbor.")).toBeInTheDocument();
    expect(screen.getByText(/final-video/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download final video" })).toBeInTheDocument();
  });

  it('shows "not yet available" for a session with no scenes, not an error (4.2)', () => {
    const snapshot = { session: makeSession({ state: "submitted" }), scenes: [] };
    render(<SessionPage {...baseProps} snapshot={snapshot} />);
    expect(screen.getByText("Scenes are not yet available.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders scenes in the order received (4.3)", () => {
    const snapshot = {
      session: makeSession({ state: "chunks-processing" }),
      scenes: [makeScene({ sceneId: "a", index: 1 }), makeScene({ sceneId: "b", index: 2 })],
    };
    render(<SessionPage {...baseProps} snapshot={snapshot} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Scene 1", "Scene 2"]);
  });

  it("shows the not-found state with a way to start a new project (4.4)", async () => {
    const user = userEvent.setup();
    const onStartNew = vi.fn();
    render(<SessionPage {...baseProps} snapshot={undefined} notFound={true} onStartNew={onStartNew} />);
    expect(screen.getByText(/no session was found/i)).toBeInTheDocument();
    const startNew = screen.getByRole("button", { name: "Start a new project" });
    await user.click(startNew);
    expect(onStartNew).toHaveBeenCalled();
  });
});
