import { VoiceEmotion, VoiceIntensity, VoicePitchDirection, VoiceSpeakingRate, type VoiceDirection } from '@content-os/contracts';
import type { AudioProviderCapabilities } from './audio-runtime.types';

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const defaults: VoiceDirection = { emotion: VoiceEmotion.NEUTRAL, intensity: VoiceIntensity.MEDIUM, speakingRate: VoiceSpeakingRate.NORMAL, pitchDirection: VoicePitchDirection.NEUTRAL, emphasisWords: [], pauseBeforeMs: 0, pauseAfterMs: 0, nonVerbalEvent: null, pronunciationOverrides: {}, manualReview: false };

export function normalizeVoiceDirection(value: Partial<VoiceDirection> | undefined, capabilities: AudioProviderCapabilities): VoiceDirection {
  const input = value ?? {};
  const emphasisWords = Array.from(new Set((input.emphasisWords ?? []).map(normalize).filter(Boolean))).sort();
  const pronunciationOverrides = Object.fromEntries(Object.entries(input.pronunciationOverrides ?? {}).map(([key, replacement]) => [normalize(key), normalize(replacement)]).filter(([key, replacement]) => key && replacement).sort(([left], [right]) => left.localeCompare(right)));
  const requestedUnsupported = (!capabilities.emotion && input.emotion && input.emotion !== VoiceEmotion.NEUTRAL)
    || (!capabilities.intensity && input.intensity && input.intensity !== VoiceIntensity.MEDIUM)
    || (!capabilities.speakingRate && input.speakingRate && input.speakingRate !== VoiceSpeakingRate.NORMAL)
    || (!capabilities.pitchDirection && input.pitchDirection && input.pitchDirection !== VoicePitchDirection.NEUTRAL)
    || (!capabilities.emphasisWords && emphasisWords.length > 0)
    || (!capabilities.pauses && ((input.pauseBeforeMs ?? 0) > 0 || (input.pauseAfterMs ?? 0) > 0))
    || (!capabilities.nonVerbalEvents && input.nonVerbalEvent !== undefined && input.nonVerbalEvent !== null)
    || (!capabilities.pronunciationOverrides && Object.keys(pronunciationOverrides).length > 0);
  return {
    emotion: capabilities.emotion ? input.emotion ?? defaults.emotion : defaults.emotion,
    intensity: capabilities.intensity ? input.intensity ?? defaults.intensity : defaults.intensity,
    speakingRate: capabilities.speakingRate ? input.speakingRate ?? defaults.speakingRate : defaults.speakingRate,
    pitchDirection: capabilities.pitchDirection ? input.pitchDirection ?? defaults.pitchDirection : defaults.pitchDirection,
    emphasisWords: capabilities.emphasisWords ? emphasisWords : [],
    pauseBeforeMs: capabilities.pauses ? Math.max(0, Math.floor(input.pauseBeforeMs ?? 0)) : 0,
    pauseAfterMs: capabilities.pauses ? Math.max(0, Math.floor(input.pauseAfterMs ?? 0)) : 0,
    nonVerbalEvent: capabilities.nonVerbalEvents ? input.nonVerbalEvent ?? null : null,
    pronunciationOverrides: capabilities.pronunciationOverrides ? pronunciationOverrides : {},
    manualReview: Boolean(input.manualReview) || requestedUnsupported,
  };
}
