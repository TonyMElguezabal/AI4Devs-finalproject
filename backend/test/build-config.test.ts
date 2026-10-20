import { describe, expect, it } from "vitest";
import { readBuildConfig } from "../src/config/build.ts";

// add-observability-telemetry (JOS-199), group 2 — Decision 8: build identity from one config module.
describe("readBuildConfig", () => {
  it("defaults to a development build with no release tag", () => {
    const build = readBuildConfig({});
    expect(build.version).toBe("0.0.0-dev");
    expect(build.channel).toBe("development");
    expect(build.releaseTag).toBeNull();
    expect(build.repository).toBe("TonyMElguezabal/AI4Devs-finalproject");
    expect(build.telemetryEndpoint).toBe("https://otel.vid4you.download");
  });

  it.each(["uat", "production"])("accepts the channel %s", (channel) => {
    expect(readBuildConfig({ VID4YOU_CHANNEL: channel }).channel).toBe(channel);
  });

  it("falls back to development for an unknown channel", () => {
    expect(readBuildConfig({ VID4YOU_CHANNEL: "staging" }).channel).toBe("development");
  });

  it("reads the version, release tag and telemetry endpoint", () => {
    const build = readBuildConfig({
      VID4YOU_VERSION: "1.2.3",
      VID4YOU_RELEASE_TAG: "v1.2.3",
      VID4YOU_TELEMETRY_ENDPOINT: "http://127.0.0.1:4318",
    });
    expect(build).toMatchObject({ version: "1.2.3", releaseTag: "v1.2.3", telemetryEndpoint: "http://127.0.0.1:4318" });
  });
});
