import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalVideoDownload } from "../src/components/FinalVideoDownload";
import { SceneRow } from "../src/components/SceneRow";
import { SessionPage } from "../src/components/SessionPage";
import { pauseRefusalSentence } from "../src/pauseRefusals";
import { rebuildScene } from "../src/api/client";
import { sceneActions } from "../src/sceneActions";
import { sceneRecoveryRefusalSentence } from "../src/sceneRecoveryRefusals";
import type { PhaseProgress, SceneEventPayload, SceneState, SessionEventPayload, SessionState } from "../src/types";

// rebuild-scene (JOS-235), spec scene-rebuild "The page offers Rebuild scene" — design Decision 9.

function makeScene(overrides: Partial<SceneEventPayload> = {}): SceneEventPayload {
  return {
    type: "scene",
    sessionId: "s1",
    sceneId: "scene-4",
    index: 4,
    state: "chunk-complete",
    stages: {},
    instruction: "",
    imageInstruction: "A lighthouse at dusk",
    videoInstruction: "Slow pan across the sea",
    updatedAt: "2026-10-28T00:00:00.000Z",
    ...overrides,
  };
}

const noop = async () => {};

async function openDetails(index: number) {
  await userEvent.setup().click(screen.getByRole("button", { name: `View scene ${index} details` }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sceneActions.rebuild", () => {
  it.each(["image-complete", "chunk-complete"] as SceneState[])("is offered for a scene in %s", (state) => {
    expect(sceneActions(makeScene({ state })).rebuild).toBe(true);
  });

  it.each(["submitted", "image-generating", "video-generating", "failed"] as SceneState[])("is not offered for a scene in %s", (state) => {
    expect(sceneActions(makeScene({ state, affectedStage: "image" })).rebuild).toBe(false);
  });

  it("is not offered while the session is assembling its final video", () => {
    expect(sceneActions(makeScene(), "final-video-generating").rebuild).toBe(false);
  });

  it.each(["chunks-processing", "final-video", "failed"] as SessionState[])("is offered while the session is %s", (state) => {
    expect(sceneActions(makeScene(), state).rebuild).toBe(true);
  });

  it("leaves retry and correction as they were for a failed scene", () => {
    expect(sceneActions(makeScene({ state: "failed", affectedStage: "video" }))).toEqual({
      retry: true,
      correctImage: false,
      correctVideo: true,
      rebuild: false,
    });
  });
});

describe("the Rebuild scene form", () => {
  it("is offered in the details of a complete scene and not in those of a generating one", async () => {
    const { unmount } = render(<SceneRow scene={makeScene()} onRetry={noop} onCorrect={noop} onRebuild={noop} />);
    await openDetails(4);
    expect(screen.getByRole("button", { name: "Rebuild scene 4" })).toBeInTheDocument();
    unmount();

    render(<SceneRow scene={makeScene({ state: "video-generating" })} onRetry={noop} onCorrect={noop} onRebuild={noop} />);
    await openDetails(4);
    expect(screen.queryByRole("button", { name: "Rebuild scene 4" })).not.toBeInTheDocument();
  });

  it("is not offered while the final video is being assembled", async () => {
    render(<SceneRow scene={makeScene()} sessionState="final-video-generating" onRetry={noop} onCorrect={noop} onRebuild={noop} />);
    await openDetails(4);

    expect(screen.queryByRole("button", { name: "Rebuild scene 4" })).not.toBeInTheDocument();
  });

  it("opens with both instructions prefilled and says what will be paid for and rebuilt", async () => {
    render(<SceneRow scene={makeScene()} onRetry={noop} onCorrect={noop} onRebuild={noop} />);
    await openDetails(4);

    await userEvent.setup().click(screen.getByRole("button", { name: "Rebuild scene 4" }));

    const form = screen.getByRole("form", { name: "Rebuild scene 4" });
    expect(within(form).getByLabelText("IMAGE instruction for scene 4")).toHaveValue("A lighthouse at dusk");
    expect(within(form).getByLabelText("VIDEO instruction for scene 4")).toHaveValue("Slow pan across the sea");
    expect(within(form).getByText(/image and the clip are generated again/i)).toBeInTheDocument();
    expect(within(form).getByText(/final video is then rebuilt/i)).toBeInTheDocument();
  });

  it("sends only the instructions the User changed", async () => {
    const user = userEvent.setup();
    const onRebuild = vi.fn(async () => {});
    render(<SceneRow scene={makeScene()} onRetry={noop} onCorrect={noop} onRebuild={onRebuild} />);
    await openDetails(4);
    await user.click(screen.getByRole("button", { name: "Rebuild scene 4" }));

    const image = screen.getByLabelText("IMAGE instruction for scene 4");
    await user.clear(image);
    await user.type(image, "A lighthouse at dusk, no text on the sign");
    await user.click(screen.getByRole("button", { name: "Rebuild image and clip" }));

    expect(onRebuild).toHaveBeenCalledExactlyOnceWith("scene-4", { imageInstruction: "A lighthouse at dusk, no text on the sign" });
  });

  it("sends nothing but the request when no instruction was changed, and closes after it was accepted", async () => {
    const user = userEvent.setup();
    const onRebuild = vi.fn(async () => {});
    render(<SceneRow scene={makeScene()} onRetry={noop} onCorrect={noop} onRebuild={onRebuild} />);
    await openDetails(4);
    await user.click(screen.getByRole("button", { name: "Rebuild scene 4" }));

    await user.click(screen.getByRole("button", { name: "Rebuild image and clip" }));

    expect(onRebuild).toHaveBeenCalledExactlyOnceWith("scene-4", {});
    expect(screen.queryByRole("form", { name: "Rebuild scene 4" })).not.toBeInTheDocument();
  });

  it("cancels without sending anything", async () => {
    const user = userEvent.setup();
    const onRebuild = vi.fn(async () => {});
    render(<SceneRow scene={makeScene()} onRetry={noop} onCorrect={noop} onRebuild={onRebuild} />);
    await openDetails(4);
    await user.click(screen.getByRole("button", { name: "Rebuild scene 4" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onRebuild).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "Rebuild scene 4" })).not.toBeInTheDocument();
  });

  it("shows a refusal as a sentence and keeps the form open", async () => {
    const user = userEvent.setup();
    const onRebuild = vi.fn(async () => {
      throw new Error("scene-not-ready");
    });
    render(<SceneRow scene={makeScene()} onRetry={noop} onCorrect={noop} onRebuild={onRebuild} />);
    await openDetails(4);
    await user.click(screen.getByRole("button", { name: "Rebuild scene 4" }));

    await user.click(screen.getByRole("button", { name: "Rebuild image and clip" }));

    expect(await screen.findByText("This scene is being generated right now. Try again when it finishes.")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Rebuild scene 4" })).toBeInTheDocument();
  });

  it("is not offered when the page has no handler for it", async () => {
    render(<SceneRow scene={makeScene()} onRetry={noop} onCorrect={noop} />);
    await openDetails(4);

    expect(screen.queryByRole("button", { name: "Rebuild scene 4" })).not.toBeInTheDocument();
  });
});

describe("refusal sentences", () => {
  it("names the two new refusals in words", () => {
    expect(sceneRecoveryRefusalSentence("scene-not-ready")).toBe("This scene is being generated right now. Try again when it finishes.");
    expect(sceneRecoveryRefusalSentence("assembly-in-progress")).toBe("The final video is being built. Try again when it finishes.");
  });
});

describe("Rebuild final video after a rebuilt scene", () => {
  const finalVideo = { version: 1, pendingPauseEdits: false, staleScenes: true };

  it("is offered when a scene was rebuilt after the current version, even with no pause edit", () => {
    render(<FinalVideoDownload url="/final" finalVideo={finalVideo} onRebuild={noop} />);

    expect(screen.getByRole("button", { name: "Rebuild final video" })).toBeInTheDocument();
  });

  it("is not offered when nothing would change", () => {
    render(<FinalVideoDownload url="/final" finalVideo={{ ...finalVideo, staleScenes: false }} onRebuild={noop} />);

    expect(screen.queryByRole("button", { name: "Rebuild final video" })).not.toBeInTheDocument();
  });

  it("is not offered while a version is being built", () => {
    render(<FinalVideoDownload url="/final" finalVideo={finalVideo} rebuilding onRebuild={noop} />);

    expect(screen.queryByRole("button", { name: "Rebuild final video" })).not.toBeInTheDocument();
  });
});

describe("rebuildScene (API client)", () => {
  it("posts the changed instructions to the scene's rebuild route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, held: false }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await rebuildScene("s1", "scene-4", { videoInstruction: "slower" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/sessions\/s1\/scenes\/scene-4\/rebuild$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ videoInstruction: "slower" });
  });

  it("rejects with the refusal reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, reason: "assembly-in-progress" }), { status: 409 })));

    await expect(rebuildScene("s1", "scene-4", {})).rejects.toThrow("assembly-in-progress");
  });
});

describe("Rebuild final video on the session page (design Decision 9)", () => {
  const phases: PhaseProgress[] = (["voice-over", "decomposition", "scenes", "assembly"] as const).map((phase) => ({ phase, status: "complete", heldCount: 0, stages: [] }));
  const session: SessionEventPayload = {
    type: "session",
    sessionId: "s1",
    title: "A title",
    script: "A script.",
    language: "en",
    state: "final-video",
    paused: false,
    held: [],
    running: [],
    phases,
    finalVideoUrl: "/sessions/s1/download/final-video",
    finalVideo: { version: 1, pendingPauseEdits: false, staleScenes: true },
    createdAt: "2026-10-28T00:00:00.000Z",
    updatedAt: "2026-10-28T00:00:00.000Z",
  };
  const props = { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", notFound: false, onStartNew: () => {}, onPause: noop, onContinue: noop, onRetry: noop, onCorrect: noop, onRetryPhase: noop, onRebuildFinalVideo: noop };

  it("is not offered while a rebuilt scene is still being generated", () => {
    const scenes = [makeScene({ sceneId: "a", index: 1 }), makeScene({ sceneId: "b", index: 2, state: "video-generating" })];
    render(<SessionPage {...props} snapshot={{ session, scenes }} />);

    expect(screen.queryByRole("button", { name: "Rebuild final video" })).not.toBeInTheDocument();
  });

  it("is offered once every scene is complete", () => {
    const scenes = [makeScene({ sceneId: "a", index: 1 }), makeScene({ sceneId: "b", index: 2 })];
    render(<SessionPage {...props} snapshot={{ session, scenes }} />);

    expect(screen.getByRole("button", { name: "Rebuild final video" })).toBeInTheDocument();
  });

  it("says in words that a scene is still being rebuilt when the command is refused anyway", () => {
    expect(pauseRefusalSentence("scenes-not-complete")).toBe("A scene is still being generated. Try again when every scene is done.");
  });
});
