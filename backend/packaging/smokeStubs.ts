import { join } from "node:path";
import { setDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { createStubAlignmentProvider, createStubInstructionGenerator } from "../src/decompositionStubs.ts";
import { createStubImageProvider, setImageProviderRegistry } from "../src/imageProvider.ts";
import { setScriptModerator } from "../src/scriptModeration.ts";
import { createStubVideoProvider, setVideoProviderRegistry, stubClipMaker, STUB_VIDEO_PROVIDER_NAME } from "../src/videoProvider.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// package-executables-build (JOS-205) Decision 7 — the `--smoke` flavor only. It lets one session reach `final-video` through
// the executable with no provider key; a release build never contains this file (a test asserts it). The real ffmpeg makes
// a stub clip at each requested duration (check-generated-clip, JOS-265), so it passes the real clip check, and the real
// assembly tool then joins them.
export function installSmokeStubs(options: { ffmpegPath: string; dataDir: string }): void {
  setScriptModerator({ moderate: () => Promise.resolve({ kind: "clean" as const }) });
  setDecompositionDependencies({ alignmentProvider: createStubAlignmentProvider(), instructionGenerator: createStubInstructionGenerator() });
  const png = Buffer.alloc(29); // 1920x1088 PNG header, the smallest buffer the image stage accepts
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1920, 16);
  png.writeUInt32BE(1088, 20);
  setImageProviderRegistry({ defaultIdentifier: "stub-image", adapters: { "stub-image": createStubImageProvider("success-bytes", { bytes: png }) } });
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoiceProvider("success") } });
  setVideoProviderRegistry({
    defaultIdentifier: STUB_VIDEO_PROVIDER_NAME,
    adapters: { [STUB_VIDEO_PROVIDER_NAME]: createStubVideoProvider("success-bytes", { clipFor: stubClipMaker(options.ffmpegPath, join(options.dataDir, "smoke-clips")) }) },
  });
  console.log("smoke-stubs installed: providers are stubs, this is not a release build");
}
