import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { createStubImageProvider, setImageProviderRegistry } from "../src/imageProvider.ts";
import { setScriptModerator } from "../src/scriptModeration.ts";
import { createStubVideoProvider, setVideoProviderRegistry, STUB_VIDEO_PROVIDER_NAME } from "../src/videoProvider.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// package-executables-build (JOS-205) Decision 7 — the `--smoke` flavor only. It lets one session reach `final-video` through
// the executable with no provider key; a release build never contains this file (a test asserts it). The real ffmpeg makes
// the one stub clip, and the real assembly tool then joins it.
export function installSmokeStubs(options: { ffmpegPath: string; dataDir: string }): void {
  setScriptModerator({ moderate: () => Promise.resolve({ kind: "clean" as const }) });
  setDecompositionDependencies({
    // The stub narration is about 1 s long; spread the script's characters over 0.95 s so the product's own
    // timestamp validation (the last character must end within the narration) accepts them.
    alignmentProvider: {
      align(_audio: Uint8Array, script: string) {
        const step = 0.95 / Math.max([...script].length, 1);
        return Promise.resolve({ kind: "success" as const, characters: [...script].map((text, i) => ({ text, start: 0.01 + i * step, end: 0.01 + (i + 1) * step })) });
      },
    },
    instructionGenerator: {
      generate(texts: readonly string[]) {
        return Promise.resolve({ kind: "success" as const, pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) });
      },
    },
  });
  const png = Buffer.alloc(29); // 1920x1088 PNG header, the smallest buffer the image stage accepts
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1920, 16);
  png.writeUInt32BE(1088, 20);
  setImageProviderRegistry({ defaultIdentifier: "stub-image", adapters: { "stub-image": createStubImageProvider("success-bytes", { bytes: png }) } });
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoiceProvider("success") } });
  const clipPath = join(options.dataDir, "smoke-clip.mp4");
  if (!existsSync(clipPath)) {
    execFileSync(options.ffmpegPath, ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=1920x1088:rate=24", "-t", "1", "-pix_fmt", "yuv420p", "-c:v", "libx264", clipPath]);
  }
  setVideoProviderRegistry({
    defaultIdentifier: STUB_VIDEO_PROVIDER_NAME,
    adapters: { [STUB_VIDEO_PROVIDER_NAME]: createStubVideoProvider("success-bytes", { bytes: readFileSync(clipPath) }) },
  });
  console.log("smoke-stubs installed: providers are stubs, this is not a release build");
}
