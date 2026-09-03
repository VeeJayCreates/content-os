import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

jest.mock('@content-os/storage', () => ({
  ProjectRepository: class ProjectRepository {},
  ProjectChannelRepository: class ProjectChannelRepository {},
}));

import { ProjectChannelController } from './project-channel.controller';
import { ProjectChannelService } from './project-channel.service';

describe('ProjectChannelController HTTP', () => {
  let app: INestApplication;
  const projectId = '11111111-1111-4111-8111-111111111111';
  const service = { getHierarchy: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectChannelController],
      providers: [{ provide: ProjectChannelService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('serves the requested Project hierarchy through the project API', async () => {
    service.getHierarchy.mockResolvedValue({ productProfile: null, channels: [] });

    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/channel-hierarchy`)
      .expect(200)
      .expect({ productProfile: null, channels: [] });
    expect(service.getHierarchy).toHaveBeenCalledWith(projectId);
  });
});
