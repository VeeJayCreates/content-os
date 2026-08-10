import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

jest.mock('@content-os/contracts', () => ({
  ResearchSourceType: { YOUTUBE: 'youtube' },
}));
jest.mock('@content-os/storage', () => ({
  ResearchSourceRepository: class ResearchSourceRepository {},
  SignalRepository: class SignalRepository {},
}));

import { IngestionService } from './ingestion.service';

const source = {
  id: 'source-1',
  projectId: 'project-1',
  name: 'ContentOS channel',
  sourceType: 'youtube',
  role: 'verification',
  url: 'https://youtube.com/channel/UCabcdefghijklmnopqrstuv',
  enabled: true,
};
const video = {
  externalId: 'video-123',
  title: 'Channel update',
  url: 'https://www.youtube.com/watch?v=video-123',
  summary: null,
  publishedAt: '2026-08-09T10:00:00.000Z',
};

describe('IngestionService YouTube flow', () => {
  const sources = { findById: jest.fn() };
  const signals = { create: jest.fn() };
  const youtubeAdapter = { fetchItems: jest.fn() };
  const service = new IngestionService(
    sources as never,
    signals as never,
    youtubeAdapter as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    sources.findById.mockResolvedValue(source);
    youtubeAdapter.fetchItems.mockResolvedValue([video]);
  });

  it('persists video IDs as the signal external identity and reports creates', async () => {
    signals.create.mockResolvedValue('created');

    await expect(service.ingest(source.id)).resolves.toEqual({
      fetchedCount: 1,
      createdCount: 1,
      duplicateCount: 0,
      skippedCount: 0,
      warnings: [],
    });
    expect(signals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: video.externalId,
        sourceType: 'youtube',
        title: video.title,
        url: video.url,
      }),
    );
  });

  it('reports duplicate videos on repeated ingestion without creating new signals', async () => {
    signals.create.mockResolvedValueOnce('created').mockResolvedValueOnce('duplicate');

    await service.ingest(source.id);
    await expect(service.ingest(source.id)).resolves.toMatchObject({
      fetchedCount: 1,
      createdCount: 0,
      duplicateCount: 1,
    });
  });

  it('does not classify storage failures as duplicates', async () => {
    signals.create.mockRejectedValue(new Error('sqlite write failure'));

    await expect(service.ingest(source.id)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('keeps disabled YouTube sources blocked before adapter dispatch', async () => {
    sources.findById.mockResolvedValue({ ...source, enabled: false });

    await expect(service.ingest(source.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(youtubeAdapter.fetchItems).not.toHaveBeenCalled();
  });

  it('does not change ingestion behavior based on source role', async () => {
    signals.create.mockResolvedValue('created');
    sources.findById.mockResolvedValue({ ...source, role: 'discovery' });

    await expect(service.ingest(source.id)).resolves.toMatchObject({
      createdCount: 1,
    });
    expect(youtubeAdapter.fetchItems).toHaveBeenCalledWith(source.url);
  });
});
