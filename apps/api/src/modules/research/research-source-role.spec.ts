jest.mock('@content-os/contracts', () => ({
  ResearchSourceType: { RSS: 'rss', YOUTUBE: 'youtube' },
  ResearchSourceRole: {
    DISCOVERY: 'discovery',
    VERIFICATION: 'verification',
    BOTH: 'both',
  },
}));
jest.mock('@content-os/storage', () => ({
  ProjectRepository: class ProjectRepository {},
  ResearchSourceRepository: class ResearchSourceRepository {},
}));

import { ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { ResearchSourceRole, ResearchSourceType } from '@content-os/contracts';
import { CreateResearchSourceDto } from './dto/create-research-source.dto';
import { UpdateResearchSourceDto } from './dto/update-research-source.dto';
import { ResearchService } from './research.service';

const source = {
  id: 'source-1',
  projectId: 'c0a8012e-5d92-4ed6-8d4c-8dc7b1514b01',
  projectName: 'Project',
  name: 'Trusted source',
  sourceType: 'rss',
  role: 'both',
  url: 'https://example.com/feed.xml',
  enabled: true,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

describe('ResearchSource role foundation', () => {
  const sources = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByProjectAndUrl: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const projects = { findById: jest.fn() };
  const youtube = { validate: jest.fn() };
  const service = new ResearchService(
    sources as never,
    projects as never,
    youtube as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    projects.findById.mockResolvedValue({ id: source.projectId });
    sources.findByProjectAndUrl.mockResolvedValue(undefined);
    sources.create.mockImplementation(async (data) => ({ ...source, ...data }));
    sources.findById.mockResolvedValue(source);
    sources.update.mockImplementation(async (_id, data) => ({ ...source, ...data }));
  });

  it('defaults an omitted role to both for backward-compatible creates', async () => {
    await expect(
      service.create({
        projectId: source.projectId,
        name: source.name,
        sourceType: ResearchSourceType.RSS,
        url: source.url,
        enabled: true,
      }),
    ).resolves.toMatchObject({ role: ResearchSourceRole.BOTH });

    expect(sources.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: ResearchSourceRole.BOTH }),
    );
  });

  it.each([
    ResearchSourceRole.DISCOVERY,
    ResearchSourceRole.VERIFICATION,
    ResearchSourceRole.BOTH,
  ])('accepts the %s role', async (role) => {
    await service.create({
      projectId: source.projectId,
      name: source.name,
      sourceType: ResearchSourceType.RSS,
      url: source.url,
      role,
      enabled: true,
    });

    expect(sources.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ role }),
    );
  });

  it('rejects an invalid role through create and update DTO validation', async () => {
    const create = Object.assign(new CreateResearchSourceDto(), {
      projectId: source.projectId,
      name: source.name,
      sourceType: 'rss',
      url: source.url,
      role: 'unknown',
    });
    const update = Object.assign(new UpdateResearchSourceDto(), {
      role: 'unknown',
    });

    expect(await validate(create)).not.toHaveLength(0);
    expect(await validate(update)).not.toHaveLength(0);
  });

  it('persists a changed role on update without changing source identity', async () => {
    await expect(
      service.update(source.id, {
        role: ResearchSourceRole.VERIFICATION,
      }),
    ).resolves.toMatchObject({
      id: source.id,
      url: source.url,
      role: ResearchSourceRole.VERIFICATION,
    });

    expect(sources.update).toHaveBeenCalledWith(source.id, {
      role: ResearchSourceRole.VERIFICATION,
    });
  });

  it('keeps project-and-URL uniqueness unchanged', async () => {
    sources.findByProjectAndUrl.mockResolvedValue(source);

    await expect(
      service.create({
        projectId: source.projectId,
        name: source.name,
        sourceType: ResearchSourceType.RSS,
        url: source.url,
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
