import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SceneList } from "../src/components/SceneList";
import { SceneRow } from "../src/components/SceneRow";
import { SessionHeader } from "../src/components/SessionHeader";
import { FinalVideoDownload } from "../src/components/FinalVideoDownload";
import App from "../src/App";
import { StartProjectForm } from "../src/components/StartProjectForm";
import { SessionPage } from "../src/components/SessionPage";
import { PhaseSection } from "../src/components/PhaseSection";
import type { Phase, PhaseProgress, PhaseStatus, SceneEventPayload, SceneState, SessionEventPayload, SessionState } from "../src/types";
import { phaseStatusClass, sceneStatusClass, sessionStatusClass } from "../src/styles/status";
import { sceneActions } from "../src/sceneActions";
import { phaseActions } from "../src/phaseActions";
import { PHASE_LABEL, PHASE_STATUS_LABEL } from "../src/phaseLabels";
import { API_BASE } from "../src/api/client";
import { SCENE_STATE_LABEL, SESSION_STATE_LABEL, AFFECTED_STAGE_LABEL, DURATION_WARNING_TEXT, SPEED_WARNING_TEXT } from "../src/statusLabels";
import { statusIcon } from "../src/styles/status";
import { Icon, type IconName } from "../src/components/Icon";
import { StatusPill } from "../src/components/StatusPill";
import { TopBar } from "../src/components/TopBar";
import { PauseDial } from "../src/components/PauseDial";

function makeScene(overrides: Partial<SceneEventPayload>): SceneEventPayload {
  return {
    type: "scene",
    sessionId: "s1",
    sceneId: overrides.sceneId ?? "scene-x",
    index: overrides.index ?? 1,
    state: "submitted",
    stages: {},
    instruction: "",
    updatedAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

/** Expands a rendered SceneRow's details, by its scene index (the accessible name uses it, not the scene id). */
async function expandScene(index: number) {
  await userEvent.setup().click(screen.getByRole("button", { name: `View scene ${index} details` }));
}

const PHASE_ORDER: Phase[] = ["voice-over", "decomposition", "scenes", "assembly"];

/** The four phases in pipeline order; every phase is pending unless `statuses` says otherwise. */
function makePhases(statuses: Partial<Record<Phase, PhaseStatus>> = {}, extras: Partial<Record<Phase, Partial<PhaseProgress>>> = {}): PhaseProgress[] {
  return PHASE_ORDER.map((phase) => ({ phase, status: statuses[phase] ?? "pending", heldCount: 0, stages: [], ...extras[phase] }));
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
    held: [],
    running: [],
    phases: makePhases(),
    createdAt: "2026-09-25T00:00:00.000Z",
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
    render(<SceneList scenes={scenes} onRetry={async () => {}} onCorrect={async () => {}} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Scene 1", "Scene 2", "Scene 3"]);
  });
});

// show-scene-results-and-actions (JOS-151) — "A state change arrives": the row
// shows a newly delivered state without a reload.
describe("A live state change reaches the row (JOS-151)", () => {
  it("shows the Image ready label once a new snapshot reports it, without a remount", () => {
    const props = { onRetry: async () => {}, onCorrect: async () => {} };
    const { rerender } = render(<SceneList {...props} scenes={[makeScene({ sceneId: "b", index: 2, state: "image-generating" })]} />);
    expect(screen.getByRole("listitem", { name: "Scene 2" })).toHaveTextContent("Generating image");

    rerender(<SceneList {...props} scenes={[makeScene({ sceneId: "b", index: 2, state: "image-complete" })]} />);

    expect(screen.getByRole("listitem", { name: "Scene 2" })).toHaveTextContent("Image ready");
    expect(screen.getByRole("listitem", { name: "Scene 2" })).not.toHaveTextContent("Generating image");
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
    const scene = makeScene({ sceneId: "f1", index: 1, state: "failed", affectedStage: "image", errorCause: "stub: content-filter rejection" });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await expandRow("f1");

    expect(screen.getByRole("form", { name: "Correct scene 1 image instruction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry scene 1" })).toBeInTheDocument();
  });

  it("does not render the correction form on a successful scene", async () => {
    const scene = makeScene({ sceneId: "ok1", index: 1, state: "chunk-complete", result: { imageUrl: "/sessions/s1/scenes/ok1/image" } });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await expandRow("ok1");

    expect(screen.queryByRole("form", { name: "Correct scene 1 image instruction" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry scene 1" })).not.toBeInTheDocument();
  });

  it("never renders an editable identifier, prompt-as-narration, or order field", async () => {
    const scene = makeScene({ sceneId: "f2", index: 1, state: "failed", affectedStage: "image" });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await expandRow("f2");

    // The only editable field is the image instruction textarea; scene id and
    // index are rendered as plain text/labels, never as <input>/<textarea>.
    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes).toHaveLength(1);
    expect(textboxes[0]).toHaveAccessibleName("Corrected image instruction for scene 1");
  });
});

// retry-or-correct-image (JOS-157), design Decision 7 — scene details show PROMPT, IMAGE and VIDEO; the
// correction form edits IMAGE (falling back to the legacy `instruction` for a scene without one).
describe("Scene details show PROMPT, IMAGE and VIDEO (JOS-157, design Decision 7)", () => {
  it("shows PROMPT, IMAGE and VIDEO for a real chunk", async () => {
    const scene = makeScene({
      sceneId: "r1",
      index: 1,
      prompt: "A lighthouse at dusk.",
      imageInstruction: "A lighthouse silhouette against an orange sky",
      videoInstruction: "Slow pan across the horizon",
    });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await expandScene(1);

    expect(screen.getByText("PROMPT").nextElementSibling).toHaveTextContent("A lighthouse at dusk.");
    expect(screen.getByText("IMAGE").nextElementSibling).toHaveTextContent("A lighthouse silhouette against an orange sky");
    expect(screen.getByText("VIDEO").nextElementSibling).toHaveTextContent("Slow pan across the horizon");
  });

  it("pre-fills the correction form with IMAGE on a real chunk", async () => {
    const scene = makeScene({
      sceneId: "r2",
      index: 1,
      state: "failed",
      affectedStage: "image",
      imageInstruction: "the stored IMAGE instruction",
      instruction: "a stale legacy value",
    });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await expandScene(1);

    expect(screen.getByRole("textbox", { name: "Corrected image instruction for scene 1" })).toHaveValue(
      "the stored IMAGE instruction",
    );
  });

  it("falls back to the legacy instruction when the scene has no IMAGE", async () => {
    const scene = makeScene({
      sceneId: "r3",
      index: 1,
      state: "failed",
      affectedStage: "image",
      instruction: "the legacy skeleton instruction",
    });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await expandScene(1);

    expect(screen.getByRole("textbox", { name: "Corrected image instruction for scene 1" })).toHaveValue(
      "the legacy skeleton instruction",
    );
  });
});

describe("Scene retry and correction refusals show a sentence (JOS-157/JOS-158)", () => {
  it("disables the retry button while pending and re-enables after the answer", async () => {
    const user = userEvent.setup();
    let resolveRetry: () => void = () => {};
    const onRetry = vi.fn(() => new Promise<void>((resolve) => (resolveRetry = resolve)));
    const scene = makeScene({ sceneId: "p1", index: 1, state: "failed", affectedStage: "image" });
    render(<SceneRow scene={scene} onRetry={onRetry} onCorrect={async () => {}} />);
    await expandScene(1);

    await user.click(screen.getByRole("button", { name: "Retry scene 1" }));
    expect(onRetry).toHaveBeenCalledExactlyOnceWith("p1");
    expect(screen.getByRole("button", { name: "Retry scene 1" })).toBeDisabled();

    resolveRetry();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry scene 1" })).toBeEnabled());
  });

  it.each([
    ["unknown-scene", "This scene could not be found."],
    ["not-failed", "This scene is not currently failed."],
  ])("shows the sentence for a retry refusal %s", async (reason, sentence) => {
    const user = userEvent.setup();
    const scene = makeScene({ sceneId: "f3", index: 1, state: "failed", affectedStage: "image" });
    render(
      <SceneRow scene={scene} onRetry={() => Promise.reject(new Error(reason))} onCorrect={async () => {}} />,
    );
    await expandScene(1);

    await user.click(screen.getByRole("button", { name: "Retry scene 1" }));

    expect(await screen.findByText(sentence)).toBeInTheDocument();
  });

  it("shows a generic sentence for a retry refusal it does not know", async () => {
    const user = userEvent.setup();
    const scene = makeScene({ sceneId: "f4", index: 1, state: "failed", affectedStage: "image" });
    render(
      <SceneRow scene={scene} onRetry={() => Promise.reject(new Error("a surprise"))} onCorrect={async () => {}} />,
    );
    await expandScene(1);

    await user.click(screen.getByRole("button", { name: "Retry scene 1" }));

    expect(await screen.findByText("The action could not be completed.")).toBeInTheDocument();
  });

  it("shows the sentence for a correction refusal, submitted with the current draft", async () => {
    const user = userEvent.setup();
    const scene = makeScene({ sceneId: "c1", index: 1, state: "failed", affectedStage: "image" });
    const onCorrect = vi.fn(() => Promise.reject(new Error("not-failed")));
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={onCorrect} />);
    await expandScene(1);

    const textarea = screen.getByRole("textbox", { name: "Corrected image instruction for scene 1" });
    await user.clear(textarea);
    await user.type(textarea, "a new instruction");
    await user.click(screen.getByRole("button", { name: "Save correction and retry" }));

    expect(onCorrect).toHaveBeenCalledExactlyOnceWith("c1", "a new instruction");
    expect(await screen.findByText("This scene is not currently failed.")).toBeInTheDocument();
  });
});

// show-scene-results-and-actions (JOS-151), group 4 — design Decisions 4 and 5.
describe("sceneActions derives actions from state and affected stage (JOS-151, Decision 4)", () => {
  it("offers retry and image correction only for a failed image scene", () => {
    expect(sceneActions(makeScene({ state: "failed", affectedStage: "image" }))).toEqual({
      retry: true,
      correctImage: true,
      correctVideo: false,
    });
  });

  it("offers retry and video correction for a failed video scene", () => {
    expect(sceneActions(makeScene({ state: "failed", affectedStage: "video" }))).toEqual({
      retry: true,
      correctImage: false,
      correctVideo: true,
    });
  });

  it("offers nothing for a failed scene whose stage is unknown", () => {
    expect(sceneActions(makeScene({ state: "failed" }))).toEqual({ retry: false, correctImage: false, correctVideo: false });
  });

  it.each<SceneState>(["submitted", "image-generating", "image-complete", "video-generating", "chunk-complete"])(
    "offers nothing for a scene in %s",
    (state) => {
      expect(sceneActions(makeScene({ state, affectedStage: "image" }))).toEqual({ retry: false, correctImage: false, correctVideo: false });
    },
  );
});

describe("Clip recovery controls derive from a failed video stage (JOS-158)", () => {
  it("offers retry and VIDEO correction only for a failed video scene", () => {
    expect(sceneActions(makeScene({ state: "failed", affectedStage: "video" }))).toEqual({
      retry: true,
      correctImage: false,
      correctVideo: true,
    });
  });

  it("prefills and submits the VIDEO instruction in the accessible correction form", async () => {
    const user = userEvent.setup();
    const onCorrect = vi.fn(async () => {});
    const scene = makeScene({
      sceneId: "clip-failed",
      index: 4,
      state: "failed",
      affectedStage: "video",
      imageInstruction: "the successful image instruction",
      videoInstruction: "the stored VIDEO instruction",
    });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={onCorrect} />);
    await expandScene(4);

    const form = screen.getByRole("form", { name: "Correct scene 4 video instruction" });
    const textarea = within(form).getByRole("textbox", { name: "Corrected video instruction for scene 4" });
    expect(textarea).toHaveValue("the stored VIDEO instruction");
    expect(screen.queryByRole("form", { name: "Correct scene 4 image instruction" })).not.toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, "a corrected VIDEO instruction");
    await user.click(within(form).getByRole("button", { name: "Save correction and retry" }));

    expect(onCorrect).toHaveBeenCalledExactlyOnceWith("clip-failed", "a corrected VIDEO instruction");
  });
});

describe("Scene details show the available results (JOS-151, Decision 5)", () => {
  async function expand(scene: SceneEventPayload) {
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await userEvent.setup().click(screen.getByRole("button", { name: `View scene ${scene.index} details` }));
  }

  it("shows the image from the API base plus the result path", async () => {
    const path = "/sessions/s1/scenes/a/image";
    await expand(makeScene({ sceneId: "a", index: 2, state: "image-complete", result: { imageUrl: path } }));

    expect(screen.getByRole("img", { name: "Scene 2 image" })).toHaveAttribute("src", `${API_BASE}${path}`);
  });

  it("shows a video player named for the scene when a clip URL is present", async () => {
    const path = "/sessions/s1/scenes/a/clip";
    await expand(makeScene({ sceneId: "a", index: 2, state: "chunk-complete", result: { videoUrl: path } }));

    const player = screen.getByLabelText("Scene 2 clip");
    expect(player.tagName).toBe("VIDEO");
    expect(player).toHaveAttribute("src", `${API_BASE}${path}`);
  });

  it("shows neither an image nor a video player when there is no result", async () => {
    await expand(makeScene({ sceneId: "a", index: 2, state: "image-generating" }));

    expect(screen.queryByRole("img", { name: "Scene 2 image" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Scene 2 clip")).not.toBeInTheDocument();
  });

  it("shows the image of a scene that failed after storing it", async () => {
    await expand(
      makeScene({ sceneId: "a", index: 1, state: "failed", affectedStage: "video", result: { imageUrl: "/sessions/s1/scenes/a/image" } }),
    );

    expect(screen.getByRole("img", { name: "Scene 1 image" })).toBeInTheDocument();
  });
});

describe("A failed scene shows its error, affected stage and only the actions for that stage (JOS-151)", () => {
  async function expand(scene: SceneEventPayload) {
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await userEvent.setup().click(screen.getByRole("button", { name: `View scene ${scene.index} details` }));
  }

  it("shows the error, the stage Image, the retry button and the correction form for an image failure", async () => {
    await expand(makeScene({ sceneId: "f", index: 1, state: "failed", affectedStage: "image", errorCause: "content filter rejection" }));

    expect(screen.getByRole("alert")).toHaveTextContent("content filter rejection");
    expect(screen.getByText("Affected stage").nextElementSibling).toHaveTextContent("Image");
    expect(screen.getByRole("button", { name: "Retry scene 1" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Correct scene 1 image instruction" })).toBeInTheDocument();
  });

  it("shows retry and VIDEO correction for a clip failure", async () => {
    await expand(makeScene({ sceneId: "f", index: 1, state: "failed", affectedStage: "video", errorCause: "clip provider timeout" }));

    expect(screen.getByRole("alert")).toHaveTextContent("clip provider timeout");
    expect(screen.getByText("Affected stage").nextElementSibling).toHaveTextContent("Clip");
    expect(screen.getByRole("button", { name: "Retry scene 1" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Correct scene 1 video instruction" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Correct scene 1 image instruction" })).not.toBeInTheDocument();
  });

  it("shows no affected stage for a scene that has not failed", async () => {
    await expand(makeScene({ sceneId: "a", index: 1, state: "image-generating" }));

    expect(screen.queryByText("Affected stage")).not.toBeInTheDocument();
  });
});

// download-scene-results (JOS-163), design Decision 3 — a download link
// follows exactly what `scene.downloads` offers, never derived from `state`.
describe("Download gating", () => {
  it("offers no download link for a scene with no downloads", async () => {
    const user = userEvent.setup();
    const pending = makeScene({ sceneId: "p1", index: 1, state: "image-generating" });
    render(<SceneRow scene={pending} onRetry={async () => {}} onCorrect={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));
    expect(screen.queryByRole("link", { name: /Download scene 1/ })).not.toBeInTheDocument();
  });

  it("offers only the image download for a video-generating scene with an image", async () => {
    const user = userEvent.setup();
    const scene = makeScene({
      sceneId: "g1",
      index: 1,
      state: "video-generating",
      downloads: { imageUrl: "/sessions/s1/scenes/g1/download/image" },
    });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));
    expect(screen.getByRole("link", { name: "Download scene 1 image" })).toHaveAttribute(
      "href",
      `${API_BASE}/sessions/s1/scenes/g1/download/image`,
    );
    expect(screen.queryByRole("link", { name: "Download scene 1 video" })).not.toBeInTheDocument();
  });

  it("offers only the image download for a failed scene with an image but no clip", async () => {
    const user = userEvent.setup();
    const scene = makeScene({
      sceneId: "f5",
      index: 1,
      state: "failed",
      affectedStage: "video",
      downloads: { imageUrl: "/sessions/s1/scenes/f5/download/image" },
    });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));
    expect(screen.getByRole("link", { name: "Download scene 1 image" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download scene 1 video" })).not.toBeInTheDocument();
  });

  it("offers both downloads for a complete scene", async () => {
    const user = userEvent.setup();
    const done = makeScene({
      sceneId: "d1",
      index: 1,
      state: "chunk-complete",
      result: { imageUrl: "/sessions/s1/scenes/d1/image" },
      downloads: { imageUrl: "/sessions/s1/scenes/d1/download/image", clipUrl: "/sessions/s1/scenes/d1/download/video" },
    });
    render(<SceneRow scene={done} onRetry={async () => {}} onCorrect={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));
    expect(screen.getByRole("link", { name: "Download scene 1 image" })).toHaveAttribute(
      "href",
      `${API_BASE}/sessions/s1/scenes/d1/download/image`,
    );
    expect(screen.getByRole("link", { name: "Download scene 1 video" })).toHaveAttribute(
      "href",
      `${API_BASE}/sessions/s1/scenes/d1/download/video`,
    );
  });

  it("offers no MP3, timestamps or generated-texts download anywhere on the session page", async () => {
    const user = userEvent.setup();
    const done = makeScene({
      sceneId: "d1",
      index: 1,
      state: "chunk-complete",
      downloads: { imageUrl: "/sessions/s1/scenes/d1/download/image", clipUrl: "/sessions/s1/scenes/d1/download/video" },
    });
    render(<SceneRow scene={done} onRetry={async () => {}} onCorrect={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));
    for (const forbidden of [/voice-over/i, /timestamps/i, /generated.text/i]) {
      expect(screen.queryByRole("link", { name: forbidden })).not.toBeInTheDocument();
    }
  });

  // download-final-video (JOS-164), design Decision 2 — the component renders
  // exactly the URL it is given; it does not know or ask about session state.
  it("renders the link from the URL it is given", () => {
    render(<FinalVideoDownload url="/final" />);
    expect(screen.getByRole("link", { name: "Download final video" })).toHaveAttribute("href", "/final");
  });

  it("renders nothing when the URL is undefined", () => {
    render(<FinalVideoDownload url={undefined} />);
    expect(screen.queryByRole("link", { name: "Download final video" })).not.toBeInTheDocument();
  });
});

// record-speed-adjustment-factor (JOS-148), task 6.2 — the requested
// duration and speed factor shown in scene details (PRD §3/§7.2/AC23),
// which SceneRow.tsx's own comment had deferred to this story.
describe("Speed-adjustment factor in scene details (JOS-148)", () => {
  it("shows the requested duration and speed factor when present", async () => {
    const user = userEvent.setup();
    const scene = makeScene({ sceneId: "sf1", index: 1, state: "chunk-complete", requestedDurationSeconds: 15, speedFactor: 1.16 });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
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
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "View scene 1 details" }));

    const durationWarning = screen.getByText(DURATION_WARNING_TEXT);
    const factorWarning = screen.getByText(SPEED_WARNING_TEXT);
    expect(durationWarning).toBeInTheDocument();
    expect(factorWarning).toBeInTheDocument();
    expect(durationWarning).not.toBe(factorWarning);
  });

  it("shows neither the requested duration nor the speed factor for a skeleton scene", async () => {
    const user = userEvent.setup();
    const scene = makeScene({ sceneId: "sf3", index: 1, state: "submitted" });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
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
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);

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
    it(`renders scene state "${state}" with its mapped status class and its plain-language label`, () => {
      const scene = makeScene({ sceneId: `st-${state}`, index: 1, state });
      render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);

      const row = screen.getByRole("listitem", { name: "Scene 1" });
      expect(row.className.split(/\s+/)).toContain(sceneStatusClass(state));
      expect(screen.getByText(SCENE_STATE_LABEL[state])).toBeInTheDocument();
      expect(row).not.toHaveTextContent(state === "failed" ? "—" : state);
    });
  }

  // distinguish-paused-session (JOS-153), design Decision 6 — a held scene maps to status-queued whatever its
  // state; a non-held scene keeps its current mapping.
  for (const state of ALL_SCENE_STATES) {
    it(`maps held scene state "${state}" to status-queued`, () => {
      expect(sceneStatusClass(state, true)).toBe("status-queued");
    });

    it(`keeps the unheld mapping for scene state "${state}"`, () => {
      expect(sceneStatusClass(state, false)).toBe(sceneStatusClass(state));
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
    it(`renders session state "${state}" with its mapped status class and its plain-language label`, () => {
      const session = makeSession({ state });
      render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

      const section = screen.getByRole("region", { name: "Session status" });
      expect(section.className.split(/\s+/)).toContain(sessionStatusClass(state));
      expect(screen.getByText(SESSION_STATE_LABEL[state])).toBeInTheDocument();
      expect(section).not.toHaveTextContent(state === "failed" ? "—" : `${state}`);
    });
  }

  it("keeps the paused marker identifiable by text, not color alone", () => {
    const session = makeSession({ state: "chunks-processing", paused: true });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText(/paused/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue session" })).toBeInTheDocument();
  });
});

// distinguish-paused-session (JOS-153), design Decision 5 — the marker, the running line and the held line as
// separate statements, in order, beside the state; none of them shown unpaused.
describe("SessionHeader paused and running display (JOS-153)", () => {
  it("shows the state and the paused marker as separate statements, the marker not an alert", () => {
    const session = makeSession({ state: "chunks-processing", paused: true });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText("Generating scenes")).toBeInTheDocument();
    const marker = screen.getByText("Paused — waiting for you to continue");
    expect(marker).toBeInTheDocument();
    expect(marker.closest('[role="alert"]')).toBeNull();
  });

  it("shows what is still generating from running", () => {
    const session = makeSession({ state: "chunks-processing", paused: true, running: [{ stage: "image", count: 1 }] });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText(/still generating: 1 image/i)).toBeInTheDocument();
  });

  it("shows nothing is generating when running is empty", () => {
    const session = makeSession({ state: "chunks-processing", paused: true, running: [] });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText(/nothing is generating/i)).toBeInTheDocument();
  });

  it("shows waiting for continue from held, and omits it when held is empty", () => {
    const withHeld = makeSession({ state: "chunks-processing", paused: true, held: [{ stage: "image", count: 2 }] });
    const { rerender } = render(<SessionHeader session={withHeld} onPause={() => {}} onContinue={() => {}} />);
    expect(screen.getByText(/waiting for continue: 2 image/i)).toBeInTheDocument();

    rerender(<SessionHeader session={makeSession({ state: "chunks-processing", paused: true, held: [] })} onPause={() => {}} onContinue={() => {}} />);
    expect(screen.queryByText(/waiting for continue/i)).not.toBeInTheDocument();
  });

  it("shows none of the marker, running or held line when not paused", () => {
    const session = makeSession({ state: "chunks-processing", paused: false, running: [{ stage: "image", count: 1 }], held: [] });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.queryByText(/paused/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/still generating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing is generating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting for continue/i)).not.toBeInTheDocument();
  });

  it("keeps the failed phase and failed scenes visible, with the marker as its own statement, when paused and failed", () => {
    const session = makeSession({ state: "failed", paused: true, failedPhase: "scenes", failedSceneIndexes: [2, 5] });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText(/Failed phase: scenes/)).toBeInTheDocument();
    expect(screen.getByText(/Failed scenes: 2, 5/)).toBeInTheDocument();
    expect(screen.getByText("Paused — waiting for you to continue")).toBeInTheDocument();
  });

  it("keeps the header's state styling (not complete or failed) when paused in chunks-processing", () => {
    const session = makeSession({ state: "chunks-processing", paused: true });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    const section = screen.getByRole("region", { name: "Session status" });
    expect(section.className.split(/\s+/)).toContain(sessionStatusClass("chunks-processing"));
    expect(section.className).not.toContain("status-complete");
    expect(section.className).not.toContain("status-failed");
  });

  it("keeps the header's final-video styling when paused in final-video", () => {
    const session = makeSession({ state: "final-video", paused: true });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    const section = screen.getByRole("region", { name: "Session status" });
    expect(section.className.split(/\s+/)).toContain(sessionStatusClass("final-video"));
  });
});

// distinguish-paused-session (JOS-153), design Decision 8 — Continue whenever paused, in every state; Pause
// whenever not paused and not final-video; never both.
describe("SessionHeader Continue/Pause availability (JOS-153, design Decision 8)", () => {
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
    it(`offers Continue and not Pause when paused in ${state}`, () => {
      render(<SessionHeader session={makeSession({ state, paused: true })} onPause={() => {}} onContinue={() => {}} />);

      expect(screen.getByRole("button", { name: "Continue session" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause session" })).not.toBeInTheDocument();
    });
  }

  for (const state of ALL_SESSION_STATES.filter((s) => s !== "final-video")) {
    it(`offers Pause and not Continue when not paused in ${state}`, () => {
      render(<SessionHeader session={makeSession({ state, paused: false })} onPause={() => {}} onContinue={() => {}} />);

      expect(screen.getByRole("button", { name: "Pause session" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Continue session" })).not.toBeInTheDocument();
    });
  }

  it("offers neither control when not paused in final-video", () => {
    render(<SessionHeader session={makeSession({ state: "final-video", paused: false })} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.queryByRole("button", { name: "Pause session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue session" })).not.toBeInTheDocument();
  });
});

// retry-decomposition (JOS-156) task 7.3 — a retry held by a pause derives chunk-decomposing, which must offer Continue.
describe("SessionHeader pause and continue while decomposing (JOS-156)", () => {
  it("offers Continue session when paused in chunk-decomposing", () => {
    render(<SessionHeader session={makeSession({ state: "chunk-decomposing", paused: true })} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByRole("button", { name: "Continue session" })).toBeInTheDocument();
  });

  it("offers Pause session when not paused in chunk-decomposing", () => {
    render(<SessionHeader session={makeSession({ state: "chunk-decomposing" })} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByRole("button", { name: "Pause session" })).toBeInTheDocument();
  });
});

// gate-assembly-on-complete-scenes (JOS-150) task 6 — the header names the
// failed scenes beside the failed phase (PRD §8.1).
describe("SessionHeader failed scenes (JOS-150)", () => {
  it("shows the failed phase and the failed scene indexes", () => {
    const session = makeSession({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [2, 5] });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText(/Failed phase: scenes/)).toBeInTheDocument();
    expect(screen.getByText(/Failed scenes: 2, 5/)).toBeInTheDocument();
  });

  it("shows no scene list for a session that failed in another phase", () => {
    const session = makeSession({ state: "failed", failedPhase: "decomposition" });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);

    expect(screen.getByText(/Failed phase: decomposition/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed scenes/)).not.toBeInTheDocument();
  });
});

// define-visual-design task 1.4 — regression guard: applying status classes
// must not change any accessible name `define-frontend-stack` established.
describe("Styling does not regress accessible names (define-visual-design)", () => {
  it("keeps SceneRow's accessible names exactly as documented once status classes are applied", () => {
    const scene = makeScene({ sceneId: "acc1", index: 9, state: "failed" });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);

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
    notFound: false,
    onStartNew: noop,
    onPause: noop,
    onContinue: noop,
    onRetry: async () => {},
    onCorrect: async () => {},
    onRetryPhase: () => Promise.resolve(),
  };

  it("shows title, script, state and available results for a session (4.1)", () => {
    const snapshot = {
      session: makeSession({ title: "My Trip", script: "A wide shot of a harbor.", state: "final-video", finalVideoUrl: "/sessions/s1/download/final-video" }),
      scenes: [],
    };
    render(<SessionPage {...baseProps} snapshot={snapshot} />);
    expect(screen.getByText("My Trip")).toBeInTheDocument();
    expect(screen.getByText("A wide shot of a harbor.")).toBeInTheDocument();
    expect(screen.getByText("Final video ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download final video" })).toBeInTheDocument();
  });

  it('shows "not yet available" for a session with no scenes, not an error (4.2)', () => {
    const snapshot = { session: makeSession({ state: "submitted" }), scenes: [] };
    render(<SessionPage {...baseProps} snapshot={snapshot} />);
    expect(screen.getByText("Scenes are not yet available.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // download-final-video (JOS-164), design Decision 2 — the page follows
  // exactly what the session read publishes, never the session's own state.
  it.each(["chunks-processing", "final-video-generating", "failed"] as const)(
    "offers no final-video download for a %s session read that carries no finalVideoUrl",
    (state) => {
      const snapshot = { session: makeSession({ state }), scenes: [] };
      render(<SessionPage {...baseProps} snapshot={snapshot} />);
      expect(screen.queryByRole("link", { name: "Download final video" })).not.toBeInTheDocument();
    },
  );

  it("offers the final-video download when the session read carries finalVideoUrl", () => {
    const snapshot = { session: makeSession({ state: "final-video", finalVideoUrl: "/sessions/s1/download/final-video" }), scenes: [] };
    render(<SessionPage {...baseProps} snapshot={snapshot} />);
    expect(screen.getByRole("link", { name: "Download final video" })).toHaveAttribute("href", `${API_BASE}/sessions/s1/download/final-video`);
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

// JOS-152 task 8.1 — held indicator in header and scene rows (wording updated by JOS-153, design Decision 5)
describe("held indicator in session header and scene rows (JOS-152, task 8.1)", () => {
  it("shows held stages and count in header when paused with held work", () => {
    const session = makeSession({ state: "chunks-processing", paused: true, held: [{ stage: "image", count: 2 }] });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for continue: 2 image/i)).toBeInTheDocument();
  });

  it("does not show held stages when not paused", () => {
    const session = makeSession({ state: "chunks-processing", paused: false, held: [] });
    render(<SessionHeader session={session} onPause={() => {}} onContinue={() => {}} />);
    expect(screen.queryByText(/held/i)).not.toBeInTheDocument();
  });

  it("a held scene row says it is waiting for continue", () => {
    const scene = makeScene({ sceneId: "h1", index: 1, state: "submitted", held: true });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    expect(screen.getByText(/waiting for continue/i)).toBeInTheDocument();
  });

  it("a generating scene in the same session does not show waiting for continue", () => {
    const scene = makeScene({ sceneId: "g1", index: 1, state: "image-generating" });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    expect(screen.queryByText(/waiting for continue/i)).not.toBeInTheDocument();
  });
});

// distinguish-paused-session (JOS-153), design Decision 6 — a generating, non-held scene says it is still
// generating while the session is paused; a held scene says it is waiting for continue; neither label appears
// when the session is not paused.
describe("Scene rows: still generating vs waiting for continue (JOS-153)", () => {
  it("a generating scene not held says it is still generating while paused", () => {
    const scene = makeScene({ sceneId: "g1", index: 1, state: "image-generating" });
    render(<SceneRow scene={scene} paused onRetry={async () => {}} onCorrect={async () => {}} />);
    expect(screen.getByText(/still generating/i)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for continue/i)).not.toBeInTheDocument();
  });

  it("a held scene says waiting for continue, not still generating, while paused, and is styled as waiting", () => {
    const scene = makeScene({ sceneId: "h1", index: 1, state: "image-complete", held: true });
    render(<SceneRow scene={scene} paused onRetry={async () => {}} onCorrect={async () => {}} />);
    expect(screen.getByText(/waiting for continue/i)).toBeInTheDocument();
    expect(screen.queryByText(/still generating/i)).not.toBeInTheDocument();
    const row = screen.getByRole("listitem", { name: "Scene 1" });
    expect(row.className.split(/\s+/)).toContain("status-queued");
    expect(row.className.split(/\s+/)).not.toContain(sceneStatusClass("image-complete"));
  });

  it("neither label appears when the session is not paused", () => {
    const scene = makeScene({ sceneId: "g2", index: 1, state: "image-generating" });
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    expect(screen.queryByText(/still generating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting for continue/i)).not.toBeInTheDocument();
  });

  it("a paused session still renders every scene row with its current state (spec: Progress stays visible while paused)", () => {
    const scenes = [
      makeScene({ sceneId: "c1", index: 1, state: "chunk-complete" }),
      makeScene({ sceneId: "c2", index: 2, state: "image-generating" }),
      makeScene({ sceneId: "c3", index: 3, state: "submitted", held: true }),
    ];
    render(<SceneList scenes={scenes} paused onRetry={async () => {}} onCorrect={async () => {}} />);

    expect(screen.getByRole("listitem", { name: "Scene 1" })).toHaveTextContent("Done");
    expect(screen.getByRole("listitem", { name: "Scene 2" })).toHaveTextContent("Generating image");
    expect(screen.getByRole("listitem", { name: "Scene 3" })).toHaveTextContent("Queued");
  });
});

// view-progress-by-phase (JOS-168), task 5.2 — design Decisions 6 and 7.
describe("Phase actions, status classes and labels (JOS-168)", () => {
  const statuses: PhaseStatus[] = ["pending", "in-progress", "complete", "failed"];

  it("phaseActions offers retry for a failed decomposition phase only when its failure is retryable (JOS-156)", () => {
    expect(phaseActions({ phase: "decomposition", status: "failed", heldCount: 0, stages: [], failure: { cause: "x", retryable: true } })).toEqual({ retry: true });
    expect(phaseActions({ phase: "decomposition", status: "failed", heldCount: 0, stages: [], failure: { cause: "x", retryable: false } })).toEqual({ retry: false });
    expect(phaseActions({ phase: "decomposition", status: "failed", heldCount: 0, stages: [] })).toEqual({ retry: false });
  });

  it("phaseActions offers retry for a failed assembly phase whatever retryable is, and nothing otherwise (JOS-159)", () => {
    expect(phaseActions({ phase: "assembly", status: "failed", heldCount: 0, stages: [], failure: { cause: "x", retryable: true } })).toEqual({ retry: true });
    expect(phaseActions({ phase: "assembly", status: "failed", heldCount: 0, stages: [], failure: { cause: "x", retryable: false } })).toEqual({ retry: true });
    expect(phaseActions({ phase: "assembly", status: "complete", heldCount: 0, stages: [] })).toEqual({ retry: false });
    expect(phaseActions({ phase: "voice-over", status: "failed", heldCount: 0, stages: [], failure: { cause: "x", retryable: true } })).toEqual({ retry: false });
  });

  it("phaseActions offers nothing for a decomposition or assembly phase that has not failed, or for any other phase at all (voice-over and scenes have no phase-level retry)", () => {
    for (const phase of PHASE_ORDER) {
      for (const status of statuses) {
        if ((phase === "decomposition" || phase === "assembly") && status === "failed") continue;
        expect(phaseActions({ phase, status, heldCount: 0, stages: [], failure: status === "failed" ? { cause: "x", retryable: true } : undefined })).toEqual({ retry: false });
      }
    }
  });

  it("maps the four statuses through the shared status classes", () => {
    expect(phaseStatusClass("pending")).toBe("status-queued");
    expect(phaseStatusClass("in-progress")).toBe("status-progress");
    expect(phaseStatusClass("complete")).toBe("status-complete");
    expect(phaseStatusClass("failed")).toBe("status-failed");
  });

  it("labels the statuses and the phases", () => {
    expect(statuses.map((status) => PHASE_STATUS_LABEL[status])).toEqual(["Not started", "In progress", "Complete", "Failed"]);
    expect(PHASE_ORDER.map((phase) => PHASE_LABEL[phase])).toEqual(["Voice-over", "Decomposition", "Scenes", "Final video"]);
  });
});

// view-progress-by-phase (JOS-168), tasks 6.1-6.3 — design Decisions 6 and 8.
describe("The session page shows one section per phase (JOS-168)", () => {
  const noop = () => {};
  const baseProps = { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", notFound: false, onStartNew: noop, onPause: noop, onContinue: noop, onRetry: async () => {}, onCorrect: async () => {}, onRetryPhase: () => Promise.resolve() };
  const SECTION_NAMES = ["Voice-over phase", "Decomposition phase", "Scenes phase", "Final video phase"];

  it("lists the four sections in pipeline order, each with its status label (6.1)", () => {
    const session = makeSession({ state: "chunks-processing", phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "in-progress" }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [] }} />);

    const sections = SECTION_NAMES.map((name) => screen.getByRole("region", { name }));

    expect(sections.map((section) => section.getAttribute("aria-label"))).toEqual(SECTION_NAMES);
    expect(sections[0]?.compareDocumentPosition(sections[1] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(sections[1]?.compareDocumentPosition(sections[2] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(sections[2]?.compareDocumentPosition(sections[3] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(sections[0] as HTMLElement).getByText("Complete")).toBeInTheDocument();
    expect(within(sections[2] as HTMLElement).getByText("In progress")).toBeInTheDocument();
    expect(within(sections[3] as HTMLElement).getByText("Not started")).toBeInTheDocument();
  });

  it("puts the scene list in the Scenes section and the download in the Final video section (6.1)", () => {
    const session = makeSession({
      state: "final-video",
      finalVideoUrl: "/sessions/s1/download/final-video",
      phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "complete", assembly: "complete" }),
    });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [makeScene({ sceneId: "a", index: 1, state: "chunk-complete" })] }} />);

    expect(within(screen.getByRole("region", { name: "Scenes phase" })).getByRole("listitem", { name: "Scene 1" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Final video phase" })).getByRole("link", { name: "Download final video" })).toBeInTheDocument();
  });

  it("keeps the header's state, failed phase, failed scenes and pause button (6.1, Decision 8)", () => {
    const session = makeSession({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [2], phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "failed" }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [makeScene({ sceneId: "b", index: 2, state: "failed", affectedStage: "image", errorCause: "The image provider refused the request." })] }} />);

    const header = within(screen.getByRole("region", { name: "Session status" }));
    expect(header.getByText("Needs attention")).toBeInTheDocument();
    expect(header.getByText("Failed phase: scenes")).toBeInTheDocument();
    expect(header.getByText("Failed scenes: 2")).toBeInTheDocument();
  });

  it("shows the cause of a failed decomposition that cannot be retried as an alert, with no retry button (6.2)", () => {
    const cause = "The narration's timestamps could not be obtained: alignment timed out.";
    const session = makeSession({ state: "failed", failedPhase: "decomposition", phases: makePhases({ "voice-over": "complete", decomposition: "failed" }, { decomposition: { failure: { cause, retryable: false } } }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [] }} />);

    const section = within(screen.getByRole("region", { name: "Decomposition phase" }));
    expect(section.getByText("Failed")).toBeInTheDocument();
    expect(section.getByRole("alert")).toHaveTextContent(cause);
    expect(section.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a failed assembly phase with its cause as soon as one arrives (6.2)", () => {
    const cause = "The final video could not be assembled.";
    const session = makeSession({ state: "failed", failedPhase: "assembly", phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "complete", assembly: "failed" }, { assembly: { failure: { cause, retryable: true } } }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [] }} />);

    const section = within(screen.getByRole("region", { name: "Final video phase" }));
    expect(section.getByText("Failed")).toBeInTheDocument();
    expect(section.getByRole("alert")).toHaveTextContent(cause);
  });

  it("shows a failed scenes phase with the failed scene offering retry and correction (6.2)", async () => {
    const user = userEvent.setup();
    const session = makeSession({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [2], phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "failed" }) });
    const scenes = [makeScene({ sceneId: "a", index: 1, state: "chunk-complete" }), makeScene({ sceneId: "b", index: 2, state: "failed", affectedStage: "image", errorCause: "The image provider refused the request." })];
    render(<SessionPage {...baseProps} snapshot={{ session, scenes }} />);

    const section = within(screen.getByRole("region", { name: "Scenes phase" }));
    // The phase's own status and the failed scene's label are both "Failed" (JOS-198: one label per state).
    expect(section.getAllByText("Failed")).toHaveLength(2);
    expect(within(section.getByRole("listitem", { name: "Scene 2" })).getByText("Failed")).toBeInTheDocument();
    await user.click(section.getByRole("button", { name: "View scene 2 details" }));
    expect(section.getByRole("button", { name: "Retry scene 2" })).toBeInTheDocument();
  });

  it("says that held work waits for the User to continue (6.2)", () => {
    const session = makeSession({ state: "chunks-processing", paused: true, held: [{ stage: "image", count: 1 }], phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "in-progress" }, { scenes: { heldCount: 1 } }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [] }} />);

    expect(within(screen.getByRole("region", { name: "Scenes phase" })).getByText("Waiting for you to continue (1 held)")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Voice-over phase" })).queryByText(/waiting for you/i)).not.toBeInTheDocument();
  });

  it("updates the sections when a new snapshot arrives, without a reload (6.3, AC2)", () => {
    const before = makeSession({ state: "chunk-decomposing", phases: makePhases({ "voice-over": "complete", decomposition: "in-progress" }) });
    const { rerender } = render(<SessionPage {...baseProps} snapshot={{ session: before, scenes: [] }} />);
    expect(within(screen.getByRole("region", { name: "Decomposition phase" })).getByText("In progress")).toBeInTheDocument();

    const after = makeSession({ state: "chunks-processing", phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "in-progress" }) });
    rerender(<SessionPage {...baseProps} snapshot={{ session: after, scenes: [] }} />);

    expect(within(screen.getByRole("region", { name: "Decomposition phase" })).getByText("Complete")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Scenes phase" })).getByText("In progress")).toBeInTheDocument();
  });

  it("removes the failure alert when the phase goes back to in progress (6.3, AC5)", () => {
    const failed = makeSession({ state: "failed", failedPhase: "decomposition", phases: makePhases({ "voice-over": "complete", decomposition: "failed" }, { decomposition: { failure: { cause: "It timed out.", retryable: true } } }) });
    const { rerender } = render(<SessionPage {...baseProps} snapshot={{ session: failed, scenes: [] }} />);
    expect(within(screen.getByRole("region", { name: "Decomposition phase" })).getByRole("alert")).toBeInTheDocument();

    const retrying = makeSession({ state: "chunk-decomposing", phases: makePhases({ "voice-over": "complete", decomposition: "in-progress" }) });
    rerender(<SessionPage {...baseProps} snapshot={{ session: retrying, scenes: [] }} />);

    expect(within(screen.getByRole("region", { name: "Decomposition phase" })).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a PhaseSection on its own with its children", () => {
    render(
      <PhaseSection progress={{ phase: "scenes", status: "pending", heldCount: 0, stages: [] }}>
        <p>inside</p>
      </PhaseSection>,
    );

    expect(within(screen.getByRole("region", { name: "Scenes phase" })).getByText("inside")).toBeInTheDocument();
  });
});

// retry-decomposition (JOS-156), group 7 — design Decision 8.
describe("The Decomposition section offers a retry (JOS-156)", () => {
  const noop = () => {};
  const cause = "The narration's timestamps could not be obtained: alignment answered HTTP 503.";
  const baseProps = { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", notFound: false, onStartNew: noop, onPause: noop, onContinue: noop, onRetry: async () => {}, onCorrect: async () => {} };

  function failedDecomposition(retryable: boolean) {
    const session = makeSession({
      state: "failed",
      failedPhase: "decomposition",
      phases: makePhases({ "voice-over": "complete", decomposition: "failed" }, { decomposition: { failure: { cause, retryable } } }),
    });
    return { session, scenes: [] };
  }

  const decompositionSection = () => within(screen.getByRole("region", { name: "Decomposition phase" }));

  it("shows Retry decomposition when the phase failed and the failure is retryable", () => {
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn()} snapshot={failedDecomposition(true)} />);

    expect(decompositionSection().getByRole("button", { name: "Retry decomposition" })).toBeEnabled();
  });

  it("shows no button for a failure that is not retryable, and no button in any other phase", () => {
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn()} snapshot={failedDecomposition(false)} />);

    expect(screen.queryByRole("button", { name: /Retry decomposition/ })).not.toBeInTheDocument();
    expect(decompositionSection().getByRole("alert")).toHaveTextContent(cause);
  });

  it("shows no button while the phase is in progress", () => {
    const session = makeSession({ state: "chunk-decomposing", phases: makePhases({ "voice-over": "complete", decomposition: "in-progress" }) });
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn()} snapshot={{ session, scenes: [] }} />);

    expect(screen.queryByRole("button", { name: /Retry decomposition/ })).not.toBeInTheDocument();
  });

  it("calls the retry for the decomposition phase on a click, and disables the button until the answer", async () => {
    const user = userEvent.setup();
    let answer: (value: { ok: true; held: boolean }) => void = () => {};
    const onRetryPhase = vi.fn(() => new Promise<{ ok: true; held: boolean }>((resolve) => (answer = resolve)));
    render(<SessionPage {...baseProps} onRetryPhase={onRetryPhase} snapshot={failedDecomposition(true)} />);

    await user.click(decompositionSection().getByRole("button", { name: "Retry decomposition" }));

    expect(onRetryPhase).toHaveBeenCalledExactlyOnceWith("decomposition");
    expect(decompositionSection().getByRole("button", { name: "Retry decomposition" })).toBeDisabled();
    answer({ ok: true, held: false });
    await waitFor(() => expect(decompositionSection().getByRole("button", { name: "Retry decomposition" })).toBeEnabled());
  });

  it("changes nothing before a snapshot arrives: the failure and the status stay", async () => {
    const user = userEvent.setup();
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn().mockResolvedValue({ ok: true, held: true })} snapshot={failedDecomposition(true)} />);

    await user.click(decompositionSection().getByRole("button", { name: "Retry decomposition" }));

    await waitFor(() => expect(decompositionSection().getByRole("button", { name: "Retry decomposition" })).toBeEnabled());
    expect(decompositionSection().getByText("Failed")).toBeInTheDocument();
    expect(decompositionSection().getByRole("alert")).toHaveTextContent(cause);
  });

  it.each([
    ["retry-already-pending", "A retry is already waiting or running."],
    ["already-registered", "The script was already divided into chunks, so there is nothing to retry."],
    ["not-failed-in-decomposition", "The decomposition has not failed, so it cannot be retried."],
    ["not-retryable", "This failure cannot be retried."],
  ])("shows the sentence for the refusal %s", async (reason, sentence) => {
    const user = userEvent.setup();
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn().mockRejectedValue(new Error(reason))} snapshot={failedDecomposition(true)} />);

    await user.click(decompositionSection().getByRole("button", { name: "Retry decomposition" }));

    expect(await decompositionSection().findByText(sentence)).toBeInTheDocument();
    expect(decompositionSection().getByRole("button", { name: "Retry decomposition" })).toBeEnabled();
  });

  it("shows a generic sentence for a refusal it does not know", async () => {
    const user = userEvent.setup();
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn().mockRejectedValue(new Error("a surprise"))} snapshot={failedDecomposition(true)} />);

    await user.click(decompositionSection().getByRole("button", { name: "Retry decomposition" }));

    expect(await decompositionSection().findByText("The retry could not be started.")).toBeInTheDocument();
  });
});

// retry-final-assembly (JOS-159), group 7 — design Decision 7: assembly always offers a retry, whatever retryable is.
describe("The Final video section offers a retry (JOS-159)", () => {
  const noop = () => {};
  const cause = "The final video could not be assembled: stub failure. Your narration, images and clips are kept.";
  const baseProps = { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", notFound: false, onStartNew: noop, onPause: noop, onContinue: noop, onRetry: async () => {}, onCorrect: async () => {} };

  function failedAssembly(retryable: boolean) {
    const session = makeSession({
      state: "failed",
      failedPhase: "assembly",
      phases: makePhases(
        { "voice-over": "complete", decomposition: "complete", scenes: "complete", assembly: "failed" },
        { assembly: { failure: { cause, retryable } } },
      ),
    });
    return { session, scenes: [] };
  }

  const finalVideoSection = () => within(screen.getByRole("region", { name: "Final video phase" }));

  it("shows the cause, Retry final video, and no download, whether or not the failure is retryable", () => {
    for (const retryable of [true, false]) {
      const { unmount } = render(<SessionPage {...baseProps} onRetryPhase={vi.fn()} snapshot={failedAssembly(retryable)} />);

      expect(finalVideoSection().getByRole("alert")).toHaveTextContent(cause);
      expect(finalVideoSection().getByRole("button", { name: "Retry final video" })).toBeEnabled();
      expect(finalVideoSection().queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("shows no button while the phase has not failed", () => {
    const session = makeSession({ state: "final-video-generating", phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "complete", assembly: "in-progress" }) });
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn()} snapshot={{ session, scenes: [] }} />);

    expect(screen.queryByRole("button", { name: /Retry final video/ })).not.toBeInTheDocument();
  });

  it("calls the retry for the assembly phase on a click, and disables the button until the answer", async () => {
    const user = userEvent.setup();
    let answer: (value: { ok: true; held: boolean }) => void = () => {};
    const onRetryPhase = vi.fn(() => new Promise<{ ok: true; held: boolean }>((resolve) => (answer = resolve)));
    render(<SessionPage {...baseProps} onRetryPhase={onRetryPhase} snapshot={failedAssembly(true)} />);

    await user.click(finalVideoSection().getByRole("button", { name: "Retry final video" }));

    expect(onRetryPhase).toHaveBeenCalledExactlyOnceWith("assembly");
    expect(finalVideoSection().getByRole("button", { name: "Retry final video" })).toBeDisabled();
    answer({ ok: true, held: false });
    await waitFor(() => expect(finalVideoSection().getByRole("button", { name: "Retry final video" })).toBeEnabled());
  });

  it.each([
    ["not-failed-in-assembly", "The final video has not failed, so it cannot be retried."],
    ["scenes-not-complete", "Not every scene is ready yet, so the final video cannot be retried."],
    ["final-video-already-generated", "The final video was already generated."],
  ])("shows the sentence for the refusal %s", async (reason, sentence) => {
    const user = userEvent.setup();
    render(<SessionPage {...baseProps} onRetryPhase={vi.fn().mockRejectedValue(new Error(reason))} snapshot={failedAssembly(true)} />);

    await user.click(finalVideoSection().getByRole("button", { name: "Retry final video" }));

    expect(await finalVideoSection().findByText(sentence)).toBeInTheDocument();
    expect(finalVideoSection().getByRole("button", { name: "Retry final video" })).toBeEnabled();
  });
});

// see-provider-and-attempts (JOS-166), design Decision 6 — diagnostics are read-only lines in the views the User already uses.
describe("Scene details show the provider and attempts of each stage that ran (JOS-166)", () => {
  const image = { stage: "image", provider: { name: "Fal.ai", model: "fal-ai/flux/dev" }, attempts: 2 } as const;
  const clip = { stage: "video", provider: { name: "RunningHub", model: "minimax/hailuo-h3" }, attempts: 1 } as const;

  async function openDetails(scene: SceneEventPayload) {
    render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
    await userEvent.setup().click(screen.getByRole("button", { name: `View scene ${scene.index} details` }));
  }

  it("lists the image and the clip under their accessible names (6.2)", async () => {
    await openDetails(makeScene({ index: 3, state: "video-generating", stages: { image, video: clip } }));

    expect(screen.getByRole("group", { name: "Scene 3 image diagnostics" })).toHaveTextContent("Image: Fal.ai (fal-ai/flux/dev), 2 attempts");
    expect(screen.getByRole("group", { name: "Scene 3 clip diagnostics" })).toHaveTextContent("Clip: RunningHub (minimax/hailuo-h3), 1 attempt");
  });

  it("writes '1 attempt' in the singular (6.2)", async () => {
    await openDetails(makeScene({ index: 1, stages: { image: { ...image, attempts: 1 } } }));

    expect(screen.getByRole("group", { name: "Scene 1 image diagnostics" }).textContent).toMatch(/1 attempt$/);
  });

  it("lists only a stage that is present, and nothing for a scene that has not run (6.2)", async () => {
    await openDetails(makeScene({ index: 2, stages: { image } }));

    expect(screen.getByRole("group", { name: "Scene 2 image diagnostics" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Scene 2 clip diagnostics" })).not.toBeInTheDocument();
  });

  it("shows no diagnostics for a scene with no stage, and no stale Provider or Attempts rows (6.2)", async () => {
    await openDetails(makeScene({ index: 4, stages: {} }));

    expect(screen.queryByRole("group", { name: /diagnostics/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Attempts")).not.toBeInTheDocument();
  });

  it("shows an unknown provider without a model in parentheses (6.2)", async () => {
    await openDetails(makeScene({ index: 5, stages: { image: { stage: "image", provider: { name: "Unknown provider", model: null }, attempts: 3 } } }));

    expect(screen.getByRole("group", { name: "Scene 5 image diagnostics" })).toHaveTextContent("Image: Unknown provider, 3 attempts");
  });

  it("offers no action inside the diagnostics (6.2)", async () => {
    await openDetails(makeScene({ index: 6, stages: { image, video: clip } }));

    expect(within(screen.getByRole("group", { name: "Scene 6 image diagnostics" })).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Phase sections list the session-level stages that ran (JOS-166)", () => {
  const noop = () => {};
  const baseProps = { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", notFound: false, onStartNew: noop, onPause: noop, onContinue: noop, onRetry: async () => {}, onCorrect: async () => {}, onRetryPhase: () => Promise.resolve() };

  const timestamps = { stage: "timestamps", provider: { name: "ElevenLabs", model: "forced alignment" }, attempts: 2 } as const;
  const instructions = { stage: "instructions", provider: { name: "OpenAI", model: "gpt-6-astra" }, attempts: 1 } as const;
  const assembly = { stage: "assembly", provider: { name: "Local assembly", model: "ffmpeg" }, attempts: 1 } as const;

  it("lists Timestamps then Scene instructions in the Decomposition section (6.3)", () => {
    const session = makeSession({ state: "chunks-processing", phases: makePhases({ "voice-over": "complete", decomposition: "complete" }, { decomposition: { stages: [timestamps, instructions] } }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [] }} />);

    const items = within(within(screen.getByRole("region", { name: "Decomposition phase" })).getByRole("list", { name: "Decomposition stages" })).getAllByRole("listitem");

    expect(items.map((item) => item.textContent)).toEqual([
      "Timestamps: ElevenLabs (forced alignment), 2 attempts",
      "Scene instructions: OpenAI (gpt-6-astra), 1 attempt",
    ]);
  });

  it("lists the voice-over stage and the assembly stage in their own sections (6.3)", () => {
    const voice = { stage: "voice-over", provider: { name: "ElevenLabs", model: "eleven_multilingual_v2" }, attempts: 1 } as const;
    const session = makeSession({ state: "final-video", phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "complete", assembly: "complete" }, { "voice-over": { stages: [voice] }, assembly: { stages: [assembly] } }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [] }} />);

    expect(within(screen.getByRole("region", { name: "Voice-over phase" })).getByRole("listitem")).toHaveTextContent("Voice-over: ElevenLabs (eleven_multilingual_v2), 1 attempt");
    expect(within(screen.getByRole("region", { name: "Final video phase" })).getByRole("listitem")).toHaveTextContent("Assembly: Local assembly (ffmpeg), 1 attempt");
  });

  it("renders nothing for a phase with no stage that ran, not an empty list or a placeholder (6.3)", () => {
    const session = makeSession({ state: "voice-over-generating", phases: makePhases({ "voice-over": "in-progress" }) });
    render(<SessionPage {...baseProps} snapshot={{ session, scenes: [] }} />);

    expect(screen.queryByRole("list", { name: /stages$/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/no data|no attempts/i)).not.toBeInTheDocument();
  });

  it("updates a count from a new snapshot without a reload (6.3)", () => {
    const first = makeSession({ phases: makePhases({}, { decomposition: { stages: [{ ...instructions, attempts: 1 }] } }) });
    const { rerender } = render(<SessionPage {...baseProps} snapshot={{ session: first, scenes: [] }} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("1 attempt");

    const second = makeSession({ phases: makePhases({}, { decomposition: { stages: [{ ...instructions, attempts: 2 }] } }) });
    rerender(<SessionPage {...baseProps} snapshot={{ session: second, scenes: [] }} />);

    expect(screen.getByRole("listitem")).toHaveTextContent("Scene instructions: OpenAI (gpt-6-astra), 2 attempts");
  });
});

// moderate-script-at-submission (JOS-187), group 5 — a refused submission shows
// the backend's reason and leaves the form as the User filled it.
describe("A refused submission (422 / 503)", () => {
  it.each([
    [422, "The script was refused by the provider's content policy (flagged: violence). Edit the script and submit it again."],
    [503, "The content check is temporarily unavailable. Submit the script again in a moment."],
  ])("shows the %s reason and keeps title, script and language", async (status, reason) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/languages")
          ? new Response(JSON.stringify([{ code: "en", label: "English" }]), { status: 200 })
          : new Response(JSON.stringify({ ok: false, reason }), { status }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Title"), "Harbor");
    await user.type(screen.getByLabelText("Script"), "A script to refuse.");
    await user.selectOptions(await screen.findByLabelText("Language"), "en");
    await user.click(screen.getByRole("button", { name: "Start project" }));

    expect((await screen.findByRole("alert")).textContent).toContain(reason);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Harbor");
    expect((screen.getByLabelText("Script") as HTMLTextAreaElement).value).toBe("A script to refuse.");
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("en");
    expect(screen.getByRole("form", { name: "Start a project" })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

// redesign-visual-design (JOS-198), group 3 — design Decisions 3 and 6: one mapping from state to plain-language label,
// one mapping from status class to icon, and a decorative icon that never changes an accessible name.
describe("Plain-language status labels (JOS-198)", () => {
  it("labels every scene state", () => {
    expect(SCENE_STATE_LABEL).toEqual({
      submitted: "Queued",
      "image-generating": "Generating image",
      "image-complete": "Image ready",
      "video-generating": "Generating clip",
      "chunk-complete": "Done",
      failed: "Failed",
    });
  });

  it("labels every session state", () => {
    expect(SESSION_STATE_LABEL).toEqual({
      submitted: "Registered",
      "voice-over-generating": "Recording voice-over",
      "voice-over-complete": "Voice-over ready",
      "chunk-decomposing": "Splitting into scenes",
      "chunks-processing": "Generating scenes",
      "final-video-generating": "Assembling final video",
      "final-video": "Final video ready",
      failed: "Needs attention",
    });
  });

  it("never shows a raw wire state as a label", () => {
    const wireStates = [...Object.keys(SCENE_STATE_LABEL), ...Object.keys(SESSION_STATE_LABEL)];
    for (const label of [...Object.values(SCENE_STATE_LABEL), ...Object.values(SESSION_STATE_LABEL)]) {
      expect(wireStates).not.toContain(label);
      expect(label).not.toMatch(/^[a-z]+(-[a-z]+)+$/);
      expect(label[0]).toBe(label[0]?.toUpperCase());
    }
  });

  it("names the affected stage and the two warnings in words", () => {
    expect(AFFECTED_STAGE_LABEL).toEqual({ image: "Image", video: "Clip" });
    expect(DURATION_WARNING_TEXT).not.toMatch(/exceeds-/);
    expect(SPEED_WARNING_TEXT).not.toMatch(/exceeds-/);
  });

  it("gives each of the four status classes one icon", () => {
    expect(statusIcon("status-complete")).toBe("check");
    expect(statusIcon("status-progress")).toBe("progress");
    expect(statusIcon("status-failed")).toBe("failed");
    expect(statusIcon("status-queued")).toBe("queued");
  });
});

describe("Icon and StatusPill (JOS-198)", () => {
  const NAMES: IconName[] = ["check", "progress", "failed", "queued", "pause", "play", "download", "retry", "chevron", "plus"];

  it.each(NAMES)("renders %s hidden from the accessibility tree", (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
  });

  it("renders the label as text, the status class on the pill, and a hidden icon", () => {
    render(<StatusPill statusClass="status-failed" label="Needs attention" />);
    const pill = screen.getByText("Needs attention");
    expect(pill.className.split(/\s+/)).toEqual(expect.arrayContaining(["status-pill", "status-failed"]));
    expect(pill.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

// group 4 — design Decision 4: the top bar owns the wordmark, the connection indicator and "New project".
describe("TopBar (JOS-198)", () => {
  it("shows only the wordmark on the start form", () => {
    render(<TopBar />);
    expect(screen.getByText("Vid4You")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.queryByText(/connecting/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows Live when connected and Connecting… otherwise", () => {
    const { rerender } = render(<TopBar connected />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    rerender(<TopBar connected={false} />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("offers New project, which calls the handler", async () => {
    const onNewProject = vi.fn();
    render(<TopBar connected onNewProject={onNewProject} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "New project" }));
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it("adds no alert and no status landmark", () => {
    render(<TopBar connected onNewProject={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("The start form card (JOS-198)", () => {
  it("keeps its form name and labels and adds a heading", () => {
    render(<StartProjectForm onStart={() => {}} languages={[{ code: "en", label: "English" }]} />);
    expect(screen.getByRole("form", { name: "Start a project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Script")).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});

// group 5 — design Decision 4: project panel beside the pipeline, a phase stepper, a plain-language header.
describe("The session page layout (JOS-198)", () => {
  const noop = () => {};
  const baseProps = { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", notFound: false, onStartNew: noop, onPause: noop, onContinue: noop, onRetry: async () => {}, onCorrect: async () => {}, onRetryPhase: () => Promise.resolve() };

  function snapshotWith(scenes: SceneEventPayload[]) {
    const session = makeSession({
      title: "My Trip",
      script: "A wide shot of a harbor.",
      language: "en",
      state: "chunks-processing",
      phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "in-progress" }),
    });
    return { session, scenes };
  }

  it("puts the title, language, script and status in a project panel", () => {
    render(<SessionPage {...baseProps} snapshot={snapshotWith([])} />);
    const panel = within(screen.getByRole("complementary"));
    expect(panel.getByRole("heading", { level: 1, name: "My Trip" })).toBeInTheDocument();
    expect(panel.getByText("en")).toBeInTheDocument();
    expect(panel.getByText("Show script")).toBeInTheDocument();
    expect(panel.getByText("A wide shot of a harbor.")).toBeInTheDocument();
    expect(panel.getByRole("region", { name: "Session status" })).toBeInTheDocument();
  });

  it("shows when the session was started, as a machine-readable time", () => {
    const snapshot = snapshotWith([]);
    snapshot.session.createdAt = "2026-10-14T10:42:00.000Z";
    render(<SessionPage {...baseProps} snapshot={snapshot} />);
    const started = within(screen.getByRole("complementary")).getByText(/^Started /);
    expect(started.tagName).toBe("TIME");
    expect(started).toHaveAttribute("datetime", "2026-10-14T10:42:00.000Z");
  });

  it("shows a pipeline progress group with the four steps in order, each with its status label", () => {
    render(<SessionPage {...baseProps} snapshot={snapshotWith([])} />);
    const group = screen.getByRole("group", { name: "Pipeline progress" });
    const steps = Array.from(group.children) as HTMLElement[];
    expect(steps.map((step) => step.textContent)).toEqual(["Voice-overComplete", "DecompositionComplete", "ScenesIn progress", "Final videoNot started"]);
    expect(group.querySelectorAll("svg[aria-hidden='true']").length).toBe(4);
  });

  it("keeps scene rows the only list items besides stage diagnostics", () => {
    render(<SessionPage {...baseProps} snapshot={snapshotWith([makeScene({ sceneId: "a", index: 1 })])} />);
    expect(screen.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual(["Scene 1"]);
  });

  it("shows how many scenes are done, as a named progress bar", () => {
    const scenes = [
      makeScene({ sceneId: "a", index: 1, state: "chunk-complete" }),
      makeScene({ sceneId: "b", index: 2, state: "image-generating" }),
      makeScene({ sceneId: "c", index: 3, state: "chunk-complete" }),
    ];
    render(<SessionPage {...baseProps} snapshot={snapshotWith(scenes)} />);
    const bar = screen.getByRole("progressbar", { name: "Scenes done" });
    expect(bar).toHaveAttribute("value", "2");
    expect(bar).toHaveAttribute("max", "3");
    expect(within(screen.getByRole("complementary")).getByText("2 of 3")).toBeInTheDocument();
  });

  it("shows no progress bar while there are no scenes", () => {
    render(<SessionPage {...baseProps} snapshot={snapshotWith([])} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("no longer prints the raw session state or a connection line", () => {
    render(<SessionPage {...baseProps} snapshot={snapshotWith([])} />);
    expect(screen.getByText("Generating scenes")).toBeInTheDocument();
    expect(screen.queryByText("chunks-processing")).not.toBeInTheDocument();
    expect(screen.queryByText(/connect/i)).not.toBeInTheDocument();
  });

  it("says the session is loading until the first snapshot arrives", () => {
    render(<SessionPage {...baseProps} snapshot={undefined} />);
    expect(screen.getByText(/loading session/i)).toBeInTheDocument();
  });
});

describe("The session header as a status pill (JOS-198)", () => {
  it("shows the plain label in a pill carrying the state's status class", () => {
    render(<SessionHeader session={makeSession({ state: "chunk-decomposing" })} onPause={() => {}} onContinue={() => {}} />);
    const pill = screen.getByText("Splitting into scenes");
    expect(pill.className.split(/\s+/)).toContain("status-pill");
    expect(pill.className.split(/\s+/)).toContain(sessionStatusClass("chunk-decomposing"));
  });

  it("keeps Pause and Continue by name, with a hidden icon", () => {
    const { rerender } = render(<SessionHeader session={makeSession({ state: "chunks-processing" })} onPause={() => {}} onContinue={() => {}} />);
    const pause = screen.getByRole("button", { name: "Pause session" });
    expect(pause.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<SessionHeader session={makeSession({ state: "chunks-processing", paused: true })} onPause={() => {}} onContinue={() => {}} />);
    expect(screen.getByRole("button", { name: "Continue session" })).toBeInTheDocument();
  });
});

describe("Phase cards (JOS-198)", () => {
  const failed: PhaseProgress = { phase: "decomposition", status: "failed", heldCount: 0, stages: [], failure: { cause: "Timestamps could not be obtained.", retryable: true } };

  it("shows the phase status as a pill", () => {
    render(<PhaseSection progress={failed} onRetry={() => Promise.resolve()} />);
    const pill = screen.getByText("Failed");
    expect(pill.className.split(/\s+/)).toEqual(expect.arrayContaining(["status-pill", "status-failed"]));
  });

  it("puts the failure cause (an alert) and the retry button in one callout", () => {
    render(<PhaseSection progress={failed} onRetry={() => Promise.resolve()} />);
    const callout = screen.getByRole("alert").closest(".callout");
    expect(callout).not.toBeNull();
    expect(callout).toContainElement(screen.getByRole("button", { name: "Retry decomposition" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Timestamps could not be obtained.");
  });

  it("shows held work as a neutral callout with the same sentence as before", () => {
    const held: PhaseProgress = { phase: "scenes", status: "in-progress", heldCount: 2, stages: [] };
    render(<PhaseSection progress={held} />);
    expect(screen.getByText("Waiting for you to continue (2 held)").closest(".callout")).not.toBeNull();
  });
});

// group 6 — design Decision 5: a scene is a card; details expand it.
describe("Scene cards (JOS-198)", () => {
  const props = { onRetry: async () => {}, onCorrect: async () => {} };

  it("shows the plain label in a pill, never the raw state", () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 2, state: "video-generating" })} {...props} />);
    const row = screen.getByRole("listitem", { name: "Scene 2" });
    const pill = within(row).getByText("Generating clip");
    expect(pill.className.split(/\s+/)).toEqual(expect.arrayContaining(["status-pill", "status-progress"]));
    expect(row).not.toHaveTextContent("video-generating");
  });

  it("shows the requested duration on the card when the backend sent one", () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, requestedDurationSeconds: 6 })} {...props} />);
    expect(within(screen.getByRole("listitem", { name: "Scene 1" })).getByText("6 s")).toBeInTheDocument();
  });

  it("shows a decorative thumbnail only when the scene has an image, and hides the index badge", () => {
    const { rerender } = render(<SceneRow scene={makeScene({ sceneId: "a", index: 1 })} {...props} />);
    const row = screen.getByRole("listitem", { name: "Scene 1" });
    expect(row.querySelector("img")).toBeNull();
    expect(row.querySelector(".scene-index")?.getAttribute("aria-hidden")).toBe("true");

    rerender(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "image-complete", result: { imageUrl: "/sessions/s1/scenes/a/image" } })} {...props} />);
    const thumb = row.querySelector("img");
    expect(thumb?.getAttribute("alt")).toBe("");
    expect(thumb?.getAttribute("src")).toBe(`${API_BASE}/sessions/s1/scenes/a/image`);
  });

  it("swaps the thumbnail for the one named image when expanded", async () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "image-complete", result: { imageUrl: "/sessions/s1/scenes/a/image" } })} {...props} />);
    await expandScene(1);
    const row = screen.getByRole("listitem", { name: "Scene 1" });
    expect(row.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Scene 1 image" })).toBeInTheDocument();
    expect(row.className.split(/\s+/)).toContain("open");
  });

  it("writes the two warnings as sentences, each an alert", async () => {
    render(
      <SceneRow
        scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", requestedDurationSeconds: 10, durationWarning: "exceeds-maximum", speedFactor: 2.3, speedFactorWarning: "exceeds-limit" })}
        {...props}
      />,
    );
    await expandScene(1);
    expect(screen.getByText(DURATION_WARNING_TEXT)).toHaveAttribute("role", "alert");
    expect(screen.getByText(SPEED_WARNING_TEXT)).toHaveAttribute("role", "alert");
  });

  it("keeps the same DOM node across a live state change, so its entrance does not replay", () => {
    const list = (state: SceneState) => (
      <SceneList scenes={[makeScene({ sceneId: "a", index: 1, state }), makeScene({ sceneId: "b", index: 2, state: "submitted" })]} {...props} />
    );
    const { rerender } = render(list("image-generating"));
    const before = [screen.getByRole("listitem", { name: "Scene 1" }), screen.getByRole("listitem", { name: "Scene 2" })];

    rerender(list("chunk-complete"));

    expect(screen.getByRole("listitem", { name: "Scene 1" })).toBe(before[0]);
    expect(screen.getByRole("listitem", { name: "Scene 2" })).toBe(before[1]);
    expect(within(before[0] as HTMLElement).getByText("Done")).toBeInTheDocument();
  });

  it("renders no empty media column for a scene that has no image, clip or download", async () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "failed", affectedStage: "image", errorCause: "refused" })} {...props} />);
    await expandScene(1);
    const row = screen.getByRole("listitem", { name: "Scene 1" });
    expect(row.querySelector(".scene-media")).toBeNull();
    expect(row.querySelector(".scene-info")).not.toBeNull();
  });

  it("keeps the numeric values as plain text", async () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", requestedDurationSeconds: 15, speedFactor: 1.16 })} {...props} />);
    await expandScene(1);
    expect(screen.getByText("Requested duration").nextElementSibling).toHaveTextContent("15");
    expect(screen.getByText("Speed factor").nextElementSibling).toHaveTextContent("1.16");
  });
});

// group 7 — design Decision 3 + proposal: the final-video card.
describe("The final-video card (JOS-198)", () => {
  it("shows the download as the primary action when a url is published", () => {
    render(<FinalVideoDownload url="/sessions/s1/download/final-video" />);
    const link = screen.getByRole("link", { name: "Download final video" });
    expect(link.className.split(/\s+/)).toEqual(expect.arrayContaining(["button", "primary"]));
    expect(screen.queryByText(/available once/i)).not.toBeInTheDocument();
  });

  it("says when it becomes available while there is no url", () => {
    render(<FinalVideoDownload url={undefined} />);
    expect(screen.getByText("Available once every scene is done")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

// adjust-scene-pause (JOS-190), group 8 — design Decision 10: the dial in an expanded scene card, and the rebuild in
// the Final video section. Names are new; no existing name changes.
describe("The pause dial (JOS-190)", () => {
  const pause = { originalSeconds: 4.3, seconds: 4.3, minSeconds: 1.8, maxSeconds: 4.3, limitedBySpeedFactor: true };
  const base = { onRetry: async () => {}, onCorrect: async () => {} };

  it("is absent from a scene whose read carries no pause", async () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete" })} {...base} onSetPause={async () => {}} />);
    await expandScene(1);

    expect(screen.queryByLabelText("Pause after scene 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset scene 1 pause" })).not.toBeInTheDocument();
  });

  it("shows a named number field with the read's value and bounds, in 0.1 s steps", async () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 2, state: "chunk-complete", pause: { ...pause, seconds: 3.3 } })} {...base} onSetPause={async () => {}} />);
    await expandScene(2);

    const field = screen.getByLabelText("Pause after scene 2") as HTMLInputElement;
    expect(field.type).toBe("number");
    expect(field.value).toBe("3.3");
    expect(field.min).toBe("1.8");
    expect(field.max).toBe("4.3");
    expect(field.step).toBe("0.1");
  });

  it("saves a changed value when the field is left, and not an unchanged one", async () => {
    const user = userEvent.setup();
    const onSetPause = vi.fn(async () => {});
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause })} {...base} onSetPause={onSetPause} />);
    await expandScene(1);
    const field = screen.getByLabelText("Pause after scene 1");

    await user.click(field);
    await user.tab();
    expect(onSetPause).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "3.3");
    await user.tab();
    expect(onSetPause).toHaveBeenCalledWith("a", 3.3);
  });

  it("saves on Enter too", async () => {
    const user = userEvent.setup();
    const onSetPause = vi.fn(async () => {});
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause })} {...base} onSetPause={onSetPause} />);
    await expandScene(1);
    const field = screen.getByLabelText("Pause after scene 1");

    await user.clear(field);
    await user.type(field, "2.5{Enter}");

    expect(onSetPause).toHaveBeenCalledWith("a", 2.5);
  });

  it("sends one request when Enter is followed by the field losing focus while the save is pending", async () => {
    const user = userEvent.setup();
    const onSetPause = vi.fn(() => new Promise<void>(() => {})); // never settles: the save stays pending
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause })} {...base} onSetPause={onSetPause} />);
    await expandScene(1);
    const field = screen.getByLabelText("Pause after scene 1");

    await user.clear(field);
    await user.type(field, "3.3{Enter}");
    fireEvent.blur(field); // the browser blurs a field that gets disabled mid-save; jsdom does not, so it is fired here

    expect(onSetPause).toHaveBeenCalledTimes(1);
  });

  it("enables Reset only when the pause differs from the original, and restores the original", async () => {
    const user = userEvent.setup();
    const onSetPause = vi.fn(async () => {});
    const { rerender } = render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause })} {...base} onSetPause={onSetPause} />);
    await expandScene(1);
    expect(screen.getByRole("button", { name: "Reset scene 1 pause" })).toBeDisabled();

    rerender(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause: { ...pause, seconds: 3.3 } })} {...base} onSetPause={onSetPause} />);
    const reset = screen.getByRole("button", { name: "Reset scene 1 pause" });
    expect(reset).toBeEnabled();
    await user.click(reset);

    expect(onSetPause).toHaveBeenCalledWith("a", 4.3);
  });

  it("explains a speed-factor bound without repeating the numeric limit", async () => {
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause })} {...base} onSetPause={async () => {}} />);
    await expandScene(1);

    const note = screen.getByText(/shorter than 1\.8 s would speed this scene's clip past the speed-factor limit/i);
    expect(note.textContent).not.toMatch(/2\.0/);
  });

  it("says nothing about the speed factor when the 0.2-3.0 s bounds apply", async () => {
    const free = { originalSeconds: 2.6, seconds: 2.6, minSeconds: 0.2, maxSeconds: 3.0, limitedBySpeedFactor: false };
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause: free })} {...base} onSetPause={async () => {}} />);
    await expandScene(1);

    expect(screen.queryByText(/speed-factor limit/i)).not.toBeInTheDocument();
    expect(screen.getByText(/0\.2 s to 3\.0 s/)).toBeInTheDocument();
  });

  it("shows a refusal as a sentence, the server's own for a range error", async () => {
    const user = userEvent.setup();
    const sentence = "The pause after scene 1 can be 1.8 s to 4.3 s, in steps of 0.1 s, or its original 4.3 s.";
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause })} {...base} onSetPause={async () => { throw new Error(sentence); }} />);
    await expandScene(1);
    const field = screen.getByLabelText("Pause after scene 1");

    await user.clear(field);
    await user.type(field, "1.0");
    await user.tab();

    expect(await screen.findByRole("status")).toHaveTextContent(sentence);
  });

  it("words the coded refusals", async () => {
    const user = userEvent.setup();
    render(<SceneRow scene={makeScene({ sceneId: "a", index: 1, state: "chunk-complete", pause })} {...base} onSetPause={async () => { throw new Error("assembly-in-progress"); }} />);
    await expandScene(1);
    const field = screen.getByLabelText("Pause after scene 1");

    await user.clear(field);
    await user.type(field, "3.3{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent(/being built/i);
  });

  it("PauseDial restores the saved value when the read changes under it", () => {
    const { rerender } = render(<PauseDial sceneIndex={1} pause={pause} onSetPause={async () => {}} />);
    rerender(<PauseDial sceneIndex={1} pause={{ ...pause, seconds: 2.0 }} onSetPause={async () => {}} />);

    expect((screen.getByLabelText("Pause after scene 1") as HTMLInputElement).value).toBe("2");
  });
});

describe("The Final video section's rebuild (JOS-190)", () => {
  it("shows the version and offers no rebuild while nothing is pending", () => {
    render(<FinalVideoDownload url="/sessions/s1/download/final-video" finalVideo={{ version: 2, pendingPauseEdits: false }} />);

    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild final video" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download final video" })).toBeInTheDocument();
  });

  it("offers Rebuild final video when edits are pending, and calls the handler", async () => {
    const user = userEvent.setup();
    const onRebuild = vi.fn(async () => ({ ok: true }));
    render(<FinalVideoDownload url="/x" finalVideo={{ version: 1, pendingPauseEdits: true }} onRebuild={onRebuild} />);

    await user.click(screen.getByRole("button", { name: "Rebuild final video" }));

    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it("keeps the download and says the new version is being built while a rebuild runs", () => {
    render(<FinalVideoDownload url="/x" finalVideo={{ version: 1, pendingPauseEdits: true }} rebuilding onRebuild={async () => ({})} />);

    expect(screen.getByRole("link", { name: "Download final video" })).toBeInTheDocument();
    expect(screen.getByText(/new version is being built/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild final video" })).not.toBeInTheDocument();
  });

  it("shows a failed rebuild's cause and keeps the button", () => {
    const cause = "The new version could not be built: stub transient failure. Your current final video (version 1) is kept.";
    render(<FinalVideoDownload url="/x" finalVideo={{ version: 1, pendingPauseEdits: true, rebuildFailure: { cause } }} onRebuild={async () => ({})} />);

    expect(screen.getByRole("alert")).toHaveTextContent(cause);
    expect(screen.getByRole("button", { name: "Rebuild final video" })).toBeInTheDocument();
  });

  it("shows a refusal as a sentence", async () => {
    const user = userEvent.setup();
    render(<FinalVideoDownload url="/x" finalVideo={{ version: 1, pendingPauseEdits: true }} onRebuild={async () => { throw new Error("nothing-to-rebuild"); }} />);

    await user.click(screen.getByRole("button", { name: "Rebuild final video" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/no changes/i);
  });

  it("shows neither version nor rebuild when the read carries no finalVideo", () => {
    render(<FinalVideoDownload url="/x" />);

    expect(screen.queryByText(/^Version/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild final video" })).not.toBeInTheDocument();
  });

  it("is wired through the session page", async () => {
    const user = userEvent.setup();
    const onRebuildFinalVideo = vi.fn(async () => ({ ok: true }));
    const session = makeSession({
      state: "final-video",
      finalVideoUrl: "/sessions/s1/download/final-video",
      finalVideo: { version: 1, pendingPauseEdits: true },
      phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "complete", assembly: "complete" }),
    });
    render(
      <SessionPage
        sessionId="01ARZ3NDEKTSV4RRFFQ69G5FAV"
        snapshot={{ session, scenes: [] }}
        notFound={false}
        onStartNew={() => {}}
        onPause={() => {}}
        onContinue={() => {}}
        onRetry={async () => {}}
        onCorrect={async () => {}}
        onRetryPhase={() => Promise.resolve()}
        onRebuildFinalVideo={onRebuildFinalVideo}
      />,
    );

    await user.click(within(screen.getByRole("region", { name: "Final video phase" })).getByRole("button", { name: "Rebuild final video" }));

    expect(onRebuildFinalVideo).toHaveBeenCalledTimes(1);
  });

  it("treats a generating session that already has a final video as a rebuild in progress", () => {
    const session = makeSession({
      state: "final-video-generating",
      finalVideoUrl: "/sessions/s1/download/final-video",
      finalVideo: { version: 1, pendingPauseEdits: true },
      phases: makePhases({ "voice-over": "complete", decomposition: "complete", scenes: "complete", assembly: "in-progress" }),
    });
    render(
      <SessionPage
        sessionId="01ARZ3NDEKTSV4RRFFQ69G5FAV"
        snapshot={{ session, scenes: [] }}
        notFound={false}
        onStartNew={() => {}}
        onPause={() => {}}
        onContinue={() => {}}
        onRetry={async () => {}}
        onCorrect={async () => {}}
        onRetryPhase={() => Promise.resolve()}
      />,
    );

    const section = within(screen.getByRole("region", { name: "Final video phase" }));
    expect(section.getByText(/new version is being built/i)).toBeInTheDocument();
    expect(section.getByRole("link", { name: "Download final video" })).toBeInTheDocument();
  });
});
