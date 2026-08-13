jest.mock('@content-os/contracts', () => ({ AudioGenerationStatus: { READY: 'ready', FAILED: 'failed' }, AudioSegmentStatus: { READY: 'ready' }, ScenePlanStatus: { READY: 'ready' }, VoiceEmotion: { NEUTRAL: 'neutral' }, VoiceIntensity: { MEDIUM: 'medium' }, VoiceSpeakingRate: { NORMAL: 'normal' }, VoicePitchDirection: { NEUTRAL: 'neutral' } }));
jest.mock('@content-os/storage', () => ({ AudioGenerationRepository: class {}, ContentScriptRepository: class {}, ScenePlanRepository: class {} }));

import { AudioGenerationController } from './audio-generation.controller';
import { AudioRuntimeService } from './audio-runtime.service';
import { ConflictException, NotFoundException, StreamableFile } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import request from 'supertest';

describe('AudioGenerationController', () => {
  it('routes generation and retrieval through the Audio Runtime service only', async () => {
    const generation = {
      status: 'ready',
      outputPath: 'C:\\audio-output\\segment.wav',
      outputMetadata: { workerRequestId: 'internal-only' },
      segments: [{ audioPath: 'C:\\audio-output\\segment.wav' }],
    };
    const audio = { generate: jest.fn().mockResolvedValue(generation), findForContentScript: jest.fn().mockResolvedValue(generation), streamReadyAudio: jest.fn().mockResolvedValue({ pipe: jest.fn() }), streamReadyAudioSegment: jest.fn().mockResolvedValue({ pipe: jest.fn() }) };
    const controller = new AudioGenerationController(audio as never);
    await expect(controller.generate('00000000-0000-4000-8000-000000000001')).resolves.toEqual({
      ...generation,
      outputPath: null,
      outputMetadata: null,
      segments: [{ audioPath: null }],
    });
    await expect(controller.find('00000000-0000-4000-8000-000000000001')).resolves.toEqual({
      ...generation,
      outputPath: null,
      outputMetadata: null,
      segments: [{ audioPath: null }],
    });
    await expect(controller.stream('00000000-0000-4000-8000-000000000001')).resolves.toBeInstanceOf(StreamableFile);
    await expect(controller.streamSegment('00000000-0000-4000-8000-000000000001', 'segment-1')).resolves.toBeInstanceOf(StreamableFile);
    expect(audio.generate).toHaveBeenCalledTimes(1);
    expect(audio.findForContentScript).toHaveBeenCalledTimes(1);
    expect(audio.streamReadyAudio).toHaveBeenCalledTimes(1);
    expect(audio.streamReadyAudioSegment).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'segment-1');
  });

  it('streams ready audio through the fixed content-script endpoint without exposing a filesystem path', async () => {
    const audio = {
      generate: jest.fn(),
      findForContentScript: jest.fn(),
      streamReadyAudio: jest.fn().mockResolvedValue(Readable.from(Buffer.from('RIFF'))),
      streamReadyAudioSegment: jest.fn().mockResolvedValue(Readable.from(Buffer.from('RIFF'))),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AudioGenerationController],
      providers: [{ provide: AudioRuntimeService, useValue: audio }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      await request(app.getHttpServer())
        .get('/content-scripts/00000000-0000-4000-8000-000000000001/audio-generation/audio')
        .expect('Content-Type', /audio\/wav/)
        .expect('Content-Disposition', /inline; filename="content-os-audio\.wav"/)
        .expect(200);
      expect(audio.streamReadyAudio).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      await request(app.getHttpServer())
        .get('/content-scripts/00000000-0000-4000-8000-000000000001/audio-generation/segments/segment-1/audio')
        .expect('Content-Type', /audio\/wav/)
        .expect('Content-Disposition', /inline; filename="content-os-audio-segment\.wav"/)
        .expect('Cache-Control', 'private, no-store')
        .expect(200);
      expect(audio.streamReadyAudioSegment).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'segment-1');
    } finally {
      await app.close();
    }
  });

  it.each([
    ['unknown segment', new NotFoundException('Audio segment not found'), 404],
    ['segment from another generation', new NotFoundException('Audio segment not found'), 404],
    ['missing or out-of-root file', new NotFoundException('Audio file not found'), 404],
    ['stale generation', new ConflictException('Audio generation is stale'), 409],
  ])('returns the service-safe rejection for %s', async (_case, error, status) => {
    const audio = {
      generate: jest.fn(),
      findForContentScript: jest.fn(),
      streamReadyAudio: jest.fn(),
      streamReadyAudioSegment: jest.fn().mockRejectedValue(error),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AudioGenerationController],
      providers: [{ provide: AudioRuntimeService, useValue: audio }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      await request(app.getHttpServer())
        .get('/content-scripts/00000000-0000-4000-8000-000000000001/audio-generation/segments/segment-1/audio')
        .expect(status);
      expect(audio.streamReadyAudioSegment).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
