import { describe, expect, it } from "vitest";
import { createElevenLabsAlignmentProvider } from "../src/alignmentProvider.ts";
import { createFalAiImageProvider } from "../src/imageProvider.ts";
import { createRunningHubVideoProvider } from "../src/videoProvider.ts";
import { createOpenAiVisualInstructionGenerator } from "../src/visualInstructions.ts";

// manage-providers-from-admin (JOS-218), group 4 — design Decisions 2 and 3: each factory takes its parameters from a
// profile and its key from a loader, so an edited parameter or key applies to the next request.

type Captured = { url: string; init: RequestInit };

function capturingFetch(answer: () => Response): { fetchFn: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return answer();
  }) as typeof fetch;
  return { fetchFn, calls };
}
const header = (call: Captured, name: string) => new Headers(call.init.headers).get(name);

describe("the image factory", () => {
  it("sends the request to the profile's model with the loader's key", async () => {
    const { fetchFn, calls } = capturingFetch(() => new Response("{}", { status: 500 }));
    await createFalAiImageProvider({ fetchFn, parameters: { model: "fal-ai/flux-pro" }, loadKey: () => "image-key-1" }).generate("a lighthouse");
    expect(calls[0]!.url).toBe("https://fal.run/fal-ai/flux-pro");
    expect(header(calls[0]!, "authorization")).toBe("Key image-key-1");
  });

  it("asks the loader for the key on every request", async () => {
    const { fetchFn, calls } = capturingFetch(() => new Response("{}", { status: 500 }));
    let key = "first-key";
    const provider = createFalAiImageProvider({ fetchFn, parameters: { model: "m" }, loadKey: () => key });
    await provider.generate("a");
    key = "second-key";
    await provider.generate("b");
    expect(calls.map((call) => header(call, "authorization"))).toEqual(["Key first-key", "Key second-key"]);
  });
});

describe("the video factory", () => {
  it("submits to the profile's endpoint path on the vendor's host with the loader's key", async () => {
    const urls: string[] = [];
    const auth: Array<string | null> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      auth.push(new Headers(init?.headers).get("authorization"));
      return new Response(JSON.stringify({ code: 0, msg: "success", errorMessages: null, data: { type: "image", download_url: "https://cdn.runninghub.io/img/abc.png", fileName: "frame.png", size: "1" } }), { status: 200 });
    }) as typeof fetch;
    await createRunningHubVideoProvider({ fetchFn, parameters: { endpoint: "/openapi/v2/other/model" }, loadKey: () => "video-key-1" }).submit({
      imageBytes: Buffer.from([1]),
      instruction: "move",
      durationSeconds: 6,
    });
    expect(urls.some((url) => url === "https://www.runninghub.ai/openapi/v2/other/model")).toBe(true);
    expect(auth.filter(Boolean).every((value) => value === "Bearer video-key-1")).toBe(true);
  });
});

describe("the alignment factory", () => {
  it("posts to the profile's endpoint path with the loader's key", async () => {
    const { fetchFn, calls } = capturingFetch(() => new Response("{}", { status: 500 }));
    await createElevenLabsAlignmentProvider({ fetchFn, parameters: { endpoint: "/v1/other-alignment" }, loadKey: () => "alignment-key-1" }).align(new Uint8Array([1]), "text");
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/other-alignment");
    expect(header(calls[0]!, "xi-api-key")).toBe("alignment-key-1");
  });
});

describe("the reasoning factory", () => {
  it("sends the profile's model with the loader's key", async () => {
    const { fetchFn, calls } = capturingFetch(() => new Response("{}", { status: 500 }));
    await createOpenAiVisualInstructionGenerator({ fetchFn, parameters: { model: "gpt-other" }, loadKey: () => "reasoning-key-1" }).generate(["a scene"], "en");
    expect(JSON.parse(String(calls[0]!.init.body)).model).toBe("gpt-other");
    expect(header(calls[0]!, "authorization")).toBe("Bearer reasoning-key-1");
  });
});
