import { homedir, userInfo } from "node:os";

/** add-observability-telemetry (JOS-199), design Decision 11 — the one scrubber for any text that leaves the
 * process or reaches the user: a cause string or a telemetry error record. Replaces the home folder, POSIX,
 * Windows drive and UNC paths, then the OS user name. Loose on purpose: over-redacting is the safe direction. */
export function redactPaths(text: string): string {
  let result = text;
  const home = homedir();
  if (home.length > 1) result = result.split(home).join("[path]");
  result = result
    .replace(/[A-Za-z]:\\\S+/g, "[path]")
    .replace(/\\\\\S+/g, "[path]")
    .replace(/\/\S+/g, "[path]");
  const name = safeUserName();
  // ponytail: names under 3 characters are skipped, they would mangle ordinary words; extend if one leaks.
  if (name.length >= 3) result = result.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"), "[user]");
  return result;
}

function safeUserName(): string {
  try {
    return userInfo().username;
  } catch {
    return "";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
