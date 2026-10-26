// package-executables-build (JOS-205) Decision 3 — what the build downloads, pinned. Every URL has a committed SHA-256;
// update the three Node hashes from https://nodejs.org/dist/<version>/SHASUMS256.txt and re-hash the ffmpeg files by hand.

export type TargetName = "darwin-arm64" | "darwin-x64" | "win32-x64";

export interface Download {
  url: string;
  sha256: string;
}

export interface Target {
  name: TargetName;
  platform: "darwin" | "win32";
  /** `.exe` on Windows. */
  exeSuffix: "" | ".exe";
  /** The official Node archive and the executable's path inside it. */
  node: Download & { archiveName: string; binaryInArchive: string };
  /** gzip-compressed single binaries. */
  ffmpeg: Download;
  ffprobe: Download;
}

/** The SEA blob is tied to the Node version that wrote it, so the host running the build must be this exact version. */
export const NODE_VERSION = "v26.4.0";

/**
 * ffmpeg 6.0 static builds from github.com/eugeneware/ffmpeg-static (release b6.0), one source for ffmpeg and ffprobe on all targets.
 * LICENSE: built with `--enable-gpl --enable-version3 --enable-nonfree` (libx264, libx265, ...). The product needs libx264
 * (`ffmpegAssemblyTool.ts`), so the pinned build is GPL and `nonfree`, which means it is NOT redistributable. Fine for a local
 * or private build; replace it with a redistributable build (and commit its hashes) before the first public release (JOS-206).
 */
const FFMPEG_RELEASE = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0";
const NODE_DIST = `https://nodejs.org/dist/${NODE_VERSION}`;

export const TARGETS: Record<TargetName, Target> = {
  "darwin-arm64": {
    name: "darwin-arm64",
    platform: "darwin",
    exeSuffix: "",
    node: {
      archiveName: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
      url: `${NODE_DIST}/node-${NODE_VERSION}-darwin-arm64.tar.gz`,
      sha256: "4f4fbcacf6b1ff1a95deedba7bd7b2d79efecaa53a8ecb0530546dc9063fefbc",
      binaryInArchive: `node-${NODE_VERSION}-darwin-arm64/bin/node`,
    },
    ffmpeg: { url: `${FFMPEG_RELEASE}/ffmpeg-darwin-arm64.gz`, sha256: "6be74d6f449889c2e87a75873894f8520cad56c08ac76f2a628d85b0519daaca" },
    ffprobe: { url: `${FFMPEG_RELEASE}/ffprobe-darwin-arm64.gz`, sha256: "a4db76bafdb8529312e138fb55aaf143cad21b6d672e2634c9dd07ae83c6a310" },
  },
  "darwin-x64": {
    name: "darwin-x64",
    platform: "darwin",
    exeSuffix: "",
    node: {
      archiveName: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
      url: `${NODE_DIST}/node-${NODE_VERSION}-darwin-x64.tar.gz`,
      sha256: "eb3bdd8dec3ff2558ee10e284da7d2a3865af0cbda21f06d397b0265837c641e",
      binaryInArchive: `node-${NODE_VERSION}-darwin-x64/bin/node`,
    },
    ffmpeg: { url: `${FFMPEG_RELEASE}/ffmpeg-darwin-x64.gz`, sha256: "a12354fce7eb62361473bbe10d53a1893695babd35869ec8e92e5dfea8d0440b" },
    ffprobe: { url: `${FFMPEG_RELEASE}/ffprobe-darwin-x64.gz`, sha256: "b75d816c5658bd417a2a05e174957963e2f9f85be3eb731b2a04467545a665dc" },
  },
  "win32-x64": {
    name: "win32-x64",
    platform: "win32",
    exeSuffix: ".exe",
    node: {
      archiveName: `node-${NODE_VERSION}-win-x64.zip`,
      url: `${NODE_DIST}/node-${NODE_VERSION}-win-x64.zip`,
      sha256: "5f87d038c6ec442aa46b9126f8ca170acbd2f3b9b9152ca798cf54596a31e214",
      binaryInArchive: `node-${NODE_VERSION}-win-x64/node.exe`,
    },
    ffmpeg: { url: `${FFMPEG_RELEASE}/ffmpeg-win32-x64.gz`, sha256: "450d66226c79405c724e821f291cab0911e934bfa9fa2231adcab587f3e07b50" },
    ffprobe: { url: `${FFMPEG_RELEASE}/ffprobe-win32-x64.gz`, sha256: "3f33adbad509f324e6f72449a5e8428fd655fb2b2eebf1d782c7ef23c44eed6a" },
  },
};
