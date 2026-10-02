import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * define-provider-configuration (JOS-165) task 2.1/2.2 — the one credential
 * path for every real provider this project calls. PRD §2.1/§11: a key is
 * read from the local environment or a local, git-ignored secrets file,
 * never hardcoded and never from the repository. The environment always
 * wins when both are present, so a deployment can override a developer's
 * local secrets file without editing it.
 *
 * The thrown message names the credential so a missing key is diagnosable,
 * but never includes a value read from either source (task 5.10's
 * requirement on the session-level failure cause applies here too, at the
 * root).
 */

const DEFAULT_SECRETS_PATH = resolve(import.meta.dirname, "../../.secrets.json");

let cachedSecrets: Record<string, unknown> | undefined;
let cachedSecretsPath: string | undefined;

function readSecretsFile(secretsPath: string): Record<string, unknown> {
  if (cachedSecretsPath === secretsPath && cachedSecrets) return cachedSecrets;
  const secrets: Record<string, unknown> = existsSync(secretsPath)
    ? JSON.parse(readFileSync(secretsPath, "utf8"))
    : {};
  cachedSecrets = secrets;
  cachedSecretsPath = secretsPath;
  return secrets;
}

export function loadCredential(name: string, options: { secretsPath?: string } = {}): string {
  const envValue = process.env[name];
  if (envValue) return envValue;

  const secretsPath = options.secretsPath ?? DEFAULT_SECRETS_PATH;
  const secrets = readSecretsFile(secretsPath);
  const secretsValue = secrets[name];
  if (typeof secretsValue === "string" && secretsValue) return secretsValue;

  throw new Error(
    `missing credential '${name}': set it in the local environment or in the local secrets file (never in the repository)`,
  );
}
