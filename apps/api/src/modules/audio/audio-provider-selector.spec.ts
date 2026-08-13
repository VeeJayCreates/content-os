import { selectAudioProvider } from './audio-provider-selector';

describe('selectAudioProvider', () => {
  const sarvam = { id: 'sarvam-bulbul-v3' } as never;
  it('selects Sarvam only when explicitly configured', () => expect(selectAudioProvider('sarvam-bulbul-v3', sarvam)).toBe(sarvam));
  it.each([undefined, '', '  ', 'unknown-provider', 'retired-provider'])('fails closed for missing, blank, or unsupported provider values', (value) => expect(() => selectAudioProvider(value, sarvam)).toThrow('AUDIO_DEFAULT_PROVIDER'));
});
