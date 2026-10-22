// name-final-video-after-title (JOS-193), design Decisions 1-3. Turns an
// arbitrary User title into a safe download filename and a Content-Disposition
// value that no title can break out of.

const MAX_NAME_CODE_POINTS = 100;
const FALLBACK_NAME = "final-video";
const WINDOWS_RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

const trimDotsAndSpaces = (name: string): string => name.replace(/^[. ]+|[. ]+$/g, "");

export function downloadFilename(title: string): string {
  let name = title
    .replace(/\p{Cs}/gu, "\ufffd")
    .normalize("NFC")
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, "_")
    .replace(/\s+/g, " ");
  name = trimDotsAndSpaces(name.trim());
  if (WINDOWS_RESERVED_DEVICE.test(name)) name = `_${name}`;
  name = trimDotsAndSpaces([...name].slice(0, MAX_NAME_CODE_POINTS).join(""));
  return `${name || FALLBACK_NAME}.mp4`;
}

/** `filename` is plain ASCII for clients that ignore `filename*` (RFC 6266); `filename*` carries the full name (RFC 5987). */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|[%\\"]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
