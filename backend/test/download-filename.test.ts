import { describe, expect, it } from "vitest";
import { contentDisposition, downloadFilename } from "../src/util/downloadFilename.ts";

// name-final-video-after-title (JOS-193), design Decisions 1-3 — the rule that
// turns an arbitrary User title into a safe download filename and header.

describe("downloadFilename", () => {
  it.each([
    ["a plain title", "Summer Trip", "Summer Trip.mp4"],
    ["a non-ASCII title", "Café de la plage 海", "Café de la plage 海.mp4"],
    ["path separators and forbidden characters", 'a/b\\c:d*e?f"g<h>i|j', "a_b_c_d_e_f_g_h_i_j.mp4"],
    ["control characters", "a\u0000b\nc\td\u007fe\u0085f", "a_b_c_d_e_f.mp4"],
    ["runs of whitespace", "a    b", "a b.mp4"],
    ["leading dots and surrounding spaces", "  ..My   Video.. ", "My Video.mp4"],
    ["a dots-only title", "...", "final-video.mp4"],
    ["an empty title", "", "final-video.mp4"],
    ["a whitespace-only title", "   ", "final-video.mp4"],
    ["a Windows reserved name", "con", "_con.mp4"],
    ["a reserved name in any case with an extension", "Nul.txt", "_Nul.txt.mp4"],
    ["a reserved numbered device", "COM1", "_COM1.mp4"],
    ["a name that merely starts like a reserved one", "console", "console.mp4"],
    ["a decomposed accent, normalised to one code point", "Café", "Café.mp4"],
    ["a lone surrogate", "a\ud800b", "a�b.mp4"],
  ])("handles %s", (_label, title, expected) => {
    expect(downloadFilename(title)).toBe(expected);
  });

  it("caps the name at 100 code points", () => {
    expect(downloadFilename("x".repeat(300))).toBe(`${"x".repeat(100)}.mp4`);
  });

  it("never splits a surrogate pair when capping", () => {
    const name = downloadFilename("😀".repeat(300));
    expect(name).toBe(`${"😀".repeat(100)}.mp4`);
    expect(name).not.toContain("�");
  });

  it("trims again when the cap leaves a trailing space", () => {
    expect(downloadFilename(`${"x".repeat(99)} y`)).toBe(`${"x".repeat(99)}.mp4`);
  });
});

describe("contentDisposition", () => {
  const parse = (header: string) => {
    const match = /^attachment; filename="([^"]*)"; filename\*=UTF-8''([^;]*)$/.exec(header);
    expect(match).not.toBeNull();
    return { ascii: match![1]!, encoded: match![2]! };
  };

  it("carries an ASCII fallback and a filename* that round-trips to the full name", () => {
    const { ascii, encoded } = parse(contentDisposition("Café 海.mp4"));
    expect(ascii).toBe("Caf_ _.mp4");
    expect(decodeURIComponent(encoded)).toBe("Café 海.mp4");
  });

  it("keeps % and backslash out of the fallback", () => {
    const { ascii } = parse(contentDisposition("100%\\done.mp4"));
    expect(ascii).toBe("100__done.mp4");
  });

  it("escapes the characters RFC 5987 forbids even though encodeURIComponent leaves them", () => {
    const { encoded } = parse(contentDisposition("it's (a) *test*.mp4"));
    expect(encoded).not.toMatch(/['()*]/);
    expect(decodeURIComponent(encoded)).toBe("it's (a) *test*.mp4");
  });

  it("cannot be broken out of by a quote or a line break", () => {
    const header = contentDisposition('x"\r\nSet-Cookie: a=b.mp4');
    expect(header).not.toMatch(/[\r\n]/);
    const { ascii } = parse(header);
    expect(ascii).not.toContain('"');
  });
});
