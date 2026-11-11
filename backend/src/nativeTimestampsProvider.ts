/**
 * attribute-native-timestamps-to-voice-provider (JOS-264), design Decisions 1-2 — the provider recorded for a timestamps
 * attempt that used the voice provider's native timestamps: the session's voice provider id marked `:native`. No voice
 * provider id contains `:`. Imports nothing, so `db.ts` and the retry recorder can use it.
 */
const NATIVE_SUFFIX = ":native";

/** Recorded before JOS-264, whatever the voice provider was; it still means ElevenLabs. */
const LEGACY_NATIVE_PROVIDER = "elevenlabs-native";

/** The seeded ElevenLabs voice profile's id (`SEEDED_PROFILES.voice.id`). */
const LEGACY_VOICE_PROVIDER = "ElevenLabs";

/** Leaves native timestamps attempts out of a query on `stage_attempts.provider_id`; they call no provider. */
export const NOT_NATIVE_TIMESTAMPS_SQL = `provider_id <> '${LEGACY_NATIVE_PROVIDER}' AND provider_id NOT LIKE '%${NATIVE_SUFFIX}'`;

export function nativeTimestampsProviderId(voiceProviderId: string): string {
  return `${voiceProviderId}${NATIVE_SUFFIX}`;
}

export function isNativeTimestampsProviderId(identifier: string | null): boolean {
  return identifier !== null && (identifier === LEGACY_NATIVE_PROVIDER || identifier.endsWith(NATIVE_SUFFIX));
}

/** The voice provider a native timestamps id names, or null when the id is not one. */
export function voiceProviderIdOfNative(identifier: string | null): string | null {
  if (identifier === LEGACY_NATIVE_PROVIDER) return LEGACY_VOICE_PROVIDER;
  return identifier?.endsWith(NATIVE_SUFFIX) ? identifier.slice(0, -NATIVE_SUFFIX.length) : null;
}
