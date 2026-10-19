import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, onRequestAsyncHookHandler } from "fastify";
import { loadCredential } from "./config/credentials.ts";

// protect-admin-with-password (JOS-173), design Decisions 1 and 3 — the Administrator gate. The password is
// a local secret read like the provider keys (environment first, then the local secrets file), never a
// settings value. Every route registered in the `/admin` child plugin passes through `requireAdministrator`
// before its body is parsed, so a route added later is protected without any code of its own.

export type AdminDenialReason = "not-configured" | "password-required" | "wrong-password";

/** `undefined` when no password is configured. An unreadable secrets file counts as none, so the gate stays closed. */
export function readAdminPassword(options: { secretsPath?: string } = {}): string | undefined {
  try {
    return loadCredential("ADMIN_PASSWORD", options);
  } catch {
    return undefined;
  }
}

// Module-level and replaceable, like the provider registries: a test can fix the password without touching
// the developer's environment or secrets file. The default reads both on each check; the secrets file is
// cached and the environment cannot change in a running process, so a change applies after a restart.
const defaultReader = (): string | undefined => readAdminPassword();
let passwordReader: () => string | undefined = defaultReader;

export function setAdminPasswordReader(next: () => string | undefined): void {
  passwordReader = next;
}

export function resetAdminPasswordReader(): void {
  passwordReader = defaultReader;
}

/** Hashing first gives two buffers of equal length, so the comparison takes the same time whatever was supplied. */
function sameSecret(supplied: string, configured: string): boolean {
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  const configuredDigest = createHash("sha256").update(configured).digest();
  return timingSafeEqual(suppliedDigest, configuredDigest);
}

/** The decision, in the order the design gives it: no password configured, none supplied, a different one. */
function denialFor(authorization: string | undefined, configured: string | undefined): AdminDenialReason | undefined {
  if (configured === undefined) return "not-configured";
  const supplied = /^bearer (.+)$/i.exec(authorization ?? "")?.[1];
  if (supplied === undefined) return "password-required";
  return sameSecret(supplied, configured) ? undefined : "wrong-password";
}

/** The reason is a code only: the body never carries the supplied or the configured password. */
export const requireAdministrator: onRequestAsyncHookHandler = async (request, reply) => {
  const denial = denialFor(request.headers.authorization, passwordReader());
  if (denial === undefined) return;
  reply.header("www-authenticate", 'Bearer realm="Vid4You Administrator"');
  return reply.code(401).send({ ok: false, reason: denial });
};

/** Call this first inside the `/admin` child plugin; every route registered after it is gated. */
export function registerAdminGate(admin: FastifyInstance): void {
  admin.addHook("onRequest", requireAdministrator);
}
