import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

jest.mock('@content-os/contracts', () => ({
  ResearchSourceRole: { DISCOVERY: 'discovery', BOTH: 'both', VERIFICATION: 'verification' },
  ResearchSourceType: { YOUTUBE: 'youtube' },
  SourceEvidenceContentStatus: { AVAILABLE: 'available', UNAVAILABLE: 'unavailable' },
  SourceEvidenceContentType: { DESCRIPTION: 'description', TRANSCRIPT: 'transcript' },
}));
jest.mock('@content-os/storage', () => ({
  ResearchSourceRepository: class ResearchSourceRepository {},
  SignalRepository: class SignalRepository {},
  SourceEvidenceContentRepository: class SourceEvidenceContentRepository {},
}));

import { CompetitorYouTubeIngestionController } from './competitor-youtube-ingestion.controller';
import { CompetitorYouTubeIngestionService } from './competitor-youtube-ingestion.service';

describe('CompetitorYouTubeIngestionController HTTP', () => {
  let app: INestApplication;
  const projectId = '11111111-1111-4111-8111-111111111111';
  const service = { ingest: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CompetitorYouTubeIngestionController],
      providers: [{ provide: CompetitorYouTubeIngestionService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('runs only the dedicated competitor YouTube ingestion service', async () => {
    service.ingest.mockResolvedValue({ sourcesChecked: 1, newVideosIngested: 1 });
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/research/competitor-youtube/ingest`)
      .expect(201)
      .expect({ sourcesChecked: 1, newVideosIngested: 1 });
    expect(service.ingest).toHaveBeenCalledWith(projectId);
  });
});
