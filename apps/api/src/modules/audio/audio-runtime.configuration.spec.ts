import { AudioRuntimeConfiguration } from './audio-runtime.configuration';

describe('AudioRuntimeConfiguration', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });
  it('uses conservative positive defaults', () => expect(new AudioRuntimeConfiguration().limits()).toEqual({ maxSegments: 50, maxCharactersPerSegment: 2500, maxCharactersPerGeneration: 50_000 }));
  it.each(['0', '-1', '1.5', 'NaN', '501'])('rejects unsafe segment ceilings', (value) => { process.env.AUDIO_MAX_SEGMENTS_PER_GENERATION = value; expect(() => new AudioRuntimeConfiguration().limits()).toThrow('AUDIO_MAX_SEGMENTS_PER_GENERATION'); });
});
