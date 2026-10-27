// add-observability-telemetry (JOS-199), design Decision 8 — build identity from one place. L6's bundler
// replaces these environment reads at build time; until then everything runs as `development`.
export type BuildChannel = "development" | "uat" | "production";

export type BuildConfig = {
  version: string;
  channel: BuildChannel;
  releaseTag: string | null;
  repository: string;
  telemetryEndpoint: string;
};

export function readBuildConfig(env: Record<string, string | undefined>): BuildConfig {
  const channel = env.VID4YOU_CHANNEL;
  return {
    version: env.VID4YOU_VERSION ?? "0.0.0-dev",
    channel: channel === "uat" || channel === "production" ? channel : "development",
    releaseTag: env.VID4YOU_RELEASE_TAG ?? null,
    repository: "TonyMElguezabal/AI4Devs-finalproject",
    telemetryEndpoint: env.VID4YOU_TELEMETRY_ENDPOINT ?? "https://otel.vid4you.download",
  };
}

// Each variable is named so the bundler can replace `process.env.VID4YOU_*` with the value set at build time (JOS-206).
export const BUILD: BuildConfig = readBuildConfig({
  VID4YOU_VERSION: process.env.VID4YOU_VERSION,
  VID4YOU_CHANNEL: process.env.VID4YOU_CHANNEL,
  VID4YOU_RELEASE_TAG: process.env.VID4YOU_RELEASE_TAG,
  VID4YOU_TELEMETRY_ENDPOINT: process.env.VID4YOU_TELEMETRY_ENDPOINT,
});
