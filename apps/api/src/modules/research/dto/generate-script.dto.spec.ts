import { ValidationPipe } from '@nestjs/common';
jest.mock('@content-os/contracts', () => ({
  ScriptFormat: { YOUTUBE_SHORT: 'youtube_short', YOUTUBE_LONG: 'youtube_long' },
  ScriptLanguage: { HINDI: 'Hindi', HINGLISH: 'Hinglish', ENGLISH: 'English' },
  ContentStylePreset: { CUSTOM: 'custom' },
  ContentStyleIntensity: { NONE: 'none', LOW: 'low', MEDIUM: 'medium', HIGH: 'high' },
  ContentTone: { CONVERSATIONAL: 'conversational' },
  NarrationStyle: { EXPLAINER: 'explainer' },
  HookStyle: { DIRECT: 'direct' },
}));
import { ScriptFormat, ScriptLanguage } from '@content-os/contracts';
import { GenerateScriptDto } from './generate-script.dto';
import { ScriptBatchDto } from './script-batch.dto';

describe('Script generation DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const metadata = { type: 'body' as const, metatype: GenerateScriptDto, data: '' };

  it.each([
    [{ format: ScriptFormat.YOUTUBE_SHORT, language: ScriptLanguage.ENGLISH }],
    [{ format: ScriptFormat.YOUTUBE_LONG, language: ScriptLanguage.HINDI, targetDurationSeconds: 900 }],
    [{ format: ScriptFormat.YOUTUBE_LONG, language: ScriptLanguage.HINGLISH, targetDurationSeconds: 60 }],
  ])('accepts supported script format, language, and duration: %o', async (value) => {
    await expect(pipe.transform(value, metadata)).resolves.toEqual(expect.objectContaining(value));
  });

  it.each([
    [{ format: 'podcast' }, 'format'],
    [{ language: 'French' }, 'language'],
    [{ targetDurationSeconds: 59 }, 'targetDurationSeconds'],
    [{ targetDurationSeconds: 3601 }, 'targetDurationSeconds'],
  ])('rejects invalid script request %o', async (value) => {
    await expect(pipe.transform(value, metadata)).rejects.toThrow();
  });

  it('validates a non-empty UUID batch list', async () => {
    const batchMetadata = { type: 'body' as const, metatype: ScriptBatchDto, data: '' };
    await expect(pipe.transform({ queueItemIds: ['11111111-1111-4111-8111-111111111111'] }, batchMetadata)).resolves.toEqual(expect.objectContaining({ queueItemIds: expect.any(Array) }));
    await expect(pipe.transform({ queueItemIds: [] }, batchMetadata)).rejects.toThrow();
    await expect(pipe.transform({ queueItemIds: ['not-a-uuid'] }, batchMetadata)).rejects.toThrow();
  });

  it('accepts a validated explicit presentation-style override without changing format validation', async () => {
    await expect(pipe.transform({ style: { tone: 'conversational', energyLevel: 'high', sensitiveTopicSarcasmEnabled: false } }, metadata)).resolves.toEqual(expect.objectContaining({ style: expect.objectContaining({ energyLevel: 'high' }) }));
    await expect(pipe.transform({ style: { tone: 'unsupported' } }, metadata)).rejects.toThrow();
  });
});
