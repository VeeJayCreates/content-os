import type { AudioProvider } from './audio-runtime.types';
import { SARVAM_BULBUL_PROVIDER_ID } from './sarvam-bulbul.configuration';

export const selectAudioProvider = (configured: string | undefined, sarvam: AudioProvider): AudioProvider => {
  const provider = configured?.trim();
  if (provider === SARVAM_BULBUL_PROVIDER_ID) return sarvam;
  throw new Error('AUDIO_DEFAULT_PROVIDER must explicitly select a supported audio provider');
};
