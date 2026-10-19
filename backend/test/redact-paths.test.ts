import { homedir, userInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { redactPaths } from "../src/util/redactPaths.ts";

// add-observability-telemetry (JOS-199), group 1 — Decision 11: one scrubber for user-facing cause
// strings and for telemetry error records, covering POSIX and Windows paths, the home folder and the user name.
describe("redactPaths", () => {
  it("replaces a POSIX path", () => {
    expect(redactPaths("ffmpeg failed on /var/data/projects/p1/clip.mp4 with exit 1")).toBe(
      "ffmpeg failed on [path] with exit 1",
    );
  });

  it("replaces a Windows drive path", () => {
    expect(redactPaths("cannot open C:\\Users\\Ana\\Vid4You\\clip.mp4 now")).toBe("cannot open [path] now");
  });

  it("replaces a UNC path", () => {
    expect(redactPaths("cannot open \\\\server\\share\\clip.mp4 now")).toBe("cannot open [path] now");
  });

  it("replaces the home folder when it is embedded in other text", () => {
    expect(redactPaths(`home=${homedir()}`)).not.toContain(homedir());
  });

  it("replaces the user name", () => {
    const name = userInfo().username;
    expect(redactPaths(`owner ${name} denied`)).toBe("owner [user] denied");
  });

  it("leaves text without a path unchanged", () => {
    expect(redactPaths("The provider returned an empty clip.")).toBe("The provider returned an empty clip.");
  });
});
