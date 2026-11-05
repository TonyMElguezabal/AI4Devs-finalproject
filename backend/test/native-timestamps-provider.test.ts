import { describe, expect, it } from "vitest";
import { isNativeTimestampsProviderId, nativeTimestampsProviderId, voiceProviderIdOfNative } from "../src/nativeTimestampsProvider.ts";

// attribute-native-timestamps-to-voice-provider (JOS-264), design Decisions 1-2.
describe("Native timestamps provider ids", () => {
  it("marks the voice provider id as native", () => {
    expect(nativeTimestampsProviderId("stub-voice")).toBe("stub-voice:native");
    expect(nativeTimestampsProviderId("ElevenLabs")).toBe("ElevenLabs:native");
  });

  it("recognises the derived ids and the legacy one, and nothing else", () => {
    expect(isNativeTimestampsProviderId("stub-voice:native")).toBe(true);
    expect(isNativeTimestampsProviderId("01JABCDEFGHJKMNPQRSTVWXYZ0:native")).toBe(true);
    expect(isNativeTimestampsProviderId("elevenlabs-native")).toBe(true);
    expect(isNativeTimestampsProviderId("elevenlabs-forced-alignment")).toBe(false);
    expect(isNativeTimestampsProviderId("ElevenLabs")).toBe(false);
    expect(isNativeTimestampsProviderId(null)).toBe(false);
  });

  it("gives back the voice provider id, ElevenLabs for the legacy id", () => {
    expect(voiceProviderIdOfNative("stub-voice:native")).toBe("stub-voice");
    expect(voiceProviderIdOfNative("elevenlabs-native")).toBe("ElevenLabs");
    expect(voiceProviderIdOfNative("ElevenLabs")).toBeNull();
  });
});
