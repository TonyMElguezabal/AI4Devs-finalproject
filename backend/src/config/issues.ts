import type { z } from "zod";

// Shared by the settings loader and the provider-parameter validation (manage-providers-from-admin, JOS-218): problems
// are written from the issue code, never from zod's own messages, because zod 3 puts the received value in some of
// them and a problem must never print a value (configure-providers-and-parameters, design Decision 2).

export function dottedPath(path: ReadonlyArray<string | number>): string {
  return path.length === 0 ? "settings" : path.join(".");
}

/**
 * Written by issue code, not taken from zod's messages: zod 3 puts the
 * received value in some of them (`received 'Acme'`), and a settings problem
 * must never print a value (design Decision 2).
 */
export function describeIssue(issue: z.ZodIssue, noun: "setting" | "parameter" = "setting"): string[] {
  const at = dottedPath(issue.path);
  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => `${dottedPath([...issue.path, key])}: unknown ${noun}`);
    case "invalid_type":
      return [`${at}: ${issue.received === "undefined" ? "is required" : `must be of type ${issue.expected}`}`];
    case "invalid_enum_value":
      return [`${at}: must be one of ${issue.options.join(", ")}`];
    case "too_small":
      if (issue.type === "string") return [`${at}: ${issue.minimum === 1 ? "must not be empty" : `must have at least ${issue.minimum} characters`}`];
      if (issue.type === "array") return [`${at}: must have at least ${issue.minimum} item(s)`];
      return [`${at}: ${issue.inclusive ? `must be at least ${issue.minimum}` : `must be greater than ${issue.minimum}`}`];
    case "too_big":
      return [`${at}: must be at most ${issue.maximum}`];
    case "not_multiple_of":
      return [`${at}: must be a multiple of ${issue.multipleOf}`];
    case "invalid_string":
      return [`${at}: has the wrong format`];
    case "custom":
      return [`${at}: ${issue.message}`];
    default:
      return [`${at}: is invalid`];
  }
}

