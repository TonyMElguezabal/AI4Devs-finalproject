import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SceneList } from "../src/components/SceneList";
import { SceneRow } from "../src/components/SceneRow";
import { FinalVideoDownload } from "../src/components/FinalVideoDownload";
import type { SceneEventPayload } from "../src/types";

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
