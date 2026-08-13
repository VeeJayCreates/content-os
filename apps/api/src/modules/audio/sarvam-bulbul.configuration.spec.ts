import { SarvamBulbulConfiguration } from './sarvam-bulbul.configuration';

describe('SarvamBulbulConfiguration', () => {
  const original = { ...process.env };
  beforeEach(() => { process.env = { ...original, AUDIO_SARVAM_OUTPUT_DIR: 'C:/safe-audio' }; });
  afterAll(() => { process.env = original; });

  it('normalizes whitespace/duplicate keys into aliases without exposing secrets', () => {
    process.env.SARVAM_API_KEYS = ' key-one, key-two ,key-one ';
    const cfg = new SarvamBulbulConfiguration().resolve();
    expect(cfg.keys.health()).toEqual([{ alias: 'sarvam-01', state: 'eligible' }, { alias: 'sarvam-02', state: 'eligible' }]);
    expect(JSON.stringify(cfg.keys.health())).not.toContain('key-one');
    expect(cfg.outputConfiguration).toEqual({ sampleRate: 24_000, codec: 'wav', pace: 1, temperature: 0.6 });
    expect(cfg.voiceId).toBe('ratan');
  });

  it.each([undefined, 'ratan', ' ratan '])('resolves the approved speaker safely', (speaker) => {
    if (speaker === undefined) delete process.env.SARVAM_SPEAKER; else process.env.SARVAM_SPEAKER = speaker;
    expect(new SarvamBulbulConfiguration().resolve().voiceId).toBe('ratan');
  });

  it('rejects unsupported or incorrectly cased speakers without substitution', () => {
    process.env.SARVAM_SPEAKER = 'Ratan';
    expect(() => new SarvamBulbulConfiguration().resolve()).toThrow('SARVAM_SPEAKER');
  });

  it('is safely unconfigured when no keys are supplied', () => {
    delete process.env.SARVAM_API_KEYS;
    expect(new SarvamBulbulConfiguration().resolve().keys.size).toBe(0);
  });
});
