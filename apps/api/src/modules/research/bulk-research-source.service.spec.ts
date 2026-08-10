import 'reflect-metadata';

jest.mock('@content-os/contracts', () => ({
  ResearchSourceType: { YOUTUBE: 'youtube', WEBSITE: 'website' },
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

import { validate } from 'class-validator';
import { ResearchSourceRole, ResearchSourceType } from '@content-os/contracts';
import { BulkCreateResearchSourcesDto } from './dto/bulk-create-research-sources.dto';
import { ResearchService } from './research.service';

const projectId = 'c0a8012e-5d92-4ed6-8d4c-8dc7b1514b01';

describe('ResearchService bulk source creation', () => {
  const sources = {
    findByProjectAndUrl: jest.fn(),
    create: jest.fn(),
  };
  const projects = { findById: jest.fn() };
  const youtube = { validate: jest.fn(), resolve: jest.fn() };
  const service = new ResearchService(
    sources as never,
    projects as never,
    youtube as never,
  );
  const existing = new Map<string, Record<string, unknown>>();

  beforeEach(() => {
    jest.resetAllMocks();
    existing.clear();
    projects.findById.mockResolvedValue({ id: projectId });
    sources.findByProjectAndUrl.mockImplementation(async (_project, url) =>
      existing.get(url),
    );
    sources.create.mockImplementation(async (data) => {
      const source = {
        id: `source-${existing.size + 1}`,
        projectName: 'Project',
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T00:00:00.000Z',
        ...data,
      };
      existing.set(String(data.url), source);
      return source;
    });
    youtube.validate.mockImplementation((url: string) => {
      if (!url.startsWith('https://youtube.com/@')) {
        throw new Error('invalid channel URL');
      }
    });
    youtube.resolve.mockImplementation(async (url: string) => {
      const handle = /@([\w.-]+)/.exec(url)?.[1] ?? null;
      const channelId = handle === 'two' ? 'UCabcdefghijklmnopqrstuv2' : 'UCabcdefghijklmnopqrstuv1';
      return {
        channelId,
        handle,
        channelName: handle === 'two' ? 'Channel Two' : 'Channel One',
        canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
      };
    });
  });

  it('adds multiple YouTube sources with the default role and supports role overrides', async () => {
    const result = await service.bulkCreate({
      projectId,
      sourceType: ResearchSourceType.YOUTUBE,
      defaultRole: ResearchSourceRole.DISCOVERY,
      sources: [
        { url: ' https://youtube.com/@one ' },
        { url: 'https://youtube.com/@two', role: ResearchSourceRole.VERIFICATION },
      ],
    });

    expect(result).toMatchObject({ total: 2, added: 2, existing: 0, failed: 0 });
    expect(sources.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      role: ResearchSourceRole.DISCOVERY,
      name: 'Channel One',
      url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv1',
    }));
    expect(sources.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: ResearchSourceRole.VERIFICATION,
      name: 'Channel Two',
      url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv2',
    }));
  });

  it('handles duplicate batch entries and existing sources without overwriting their role', async () => {
    existing.set('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv1', {
      id: 'existing-source',
      projectId,
      projectName: 'Project',
      name: '@one',
      sourceType: 'youtube',
      role: ResearchSourceRole.DISCOVERY,
      url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv1',
      enabled: true,
      createdAt: 'x',
      updatedAt: 'x',
    });

    const result = await service.bulkCreate({
      projectId,
      sourceType: ResearchSourceType.YOUTUBE,
      defaultRole: ResearchSourceRole.VERIFICATION,
      sources: [
        { url: 'https://youtube.com/@one' },
        { url: 'https://youtube.com/@one' },
      ],
    });

    expect(result).toMatchObject({ total: 2, added: 0, existing: 2, failed: 0 });
    expect(result.results[0]).toMatchObject({
      status: 'existing',
      source: { role: ResearchSourceRole.DISCOVERY },
    });
    expect(sources.create).not.toHaveBeenCalled();
  });

  it('keeps successful sources when invalid, unresolved, and invalid-role entries fail', async () => {
    youtube.resolve.mockImplementation(async (url: string) => {
      if (url.includes('unresolved')) throw new Error('network detail');
      return {
        channelId: 'UCabcdefghijklmnopqrstuv1',
        handle: 'one',
        channelName: 'Channel One',
        canonicalUrl: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv1',
      };
    });

    const result = await service.bulkCreate({
      projectId,
      sourceType: ResearchSourceType.YOUTUBE,
      defaultRole: ResearchSourceRole.DISCOVERY,
      sources: [
        { url: 'https://youtube.com/@one' },
        { url: 'not a URL' },
        { url: 'https://youtube.com/@unresolved' },
        { url: 'https://youtube.com/@bad-role', role: 'invalid-role' },
      ],
    });

    expect(result).toMatchObject({ total: 4, added: 1, existing: 0, failed: 3 });
    expect(result.results.map((item) => item.errorCode)).toEqual([
      undefined,
      'invalid_url',
      'unresolved_youtube_channel',
      'invalid_role',
    ]);
    expect(sources.create).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when the same batch is submitted twice', async () => {
    const input = {
      projectId,
      sourceType: ResearchSourceType.YOUTUBE,
      defaultRole: ResearchSourceRole.BOTH,
      sources: [{ url: 'https://youtube.com/@one' }],
    };

    await expect(service.bulkCreate(input)).resolves.toMatchObject({ added: 1 });
    await expect(service.bulkCreate(input)).resolves.toMatchObject({
      added: 0,
      existing: 1,
    });
    expect(sources.create).toHaveBeenCalledTimes(1);
  });

  it('validates the request maximum and invalid default role before work begins', async () => {
    const oversized = Object.assign(new BulkCreateResearchSourcesDto(), {
      projectId,
      sourceType: ResearchSourceType.YOUTUBE,
      defaultRole: ResearchSourceRole.DISCOVERY,
      sources: Array.from({ length: 101 }, () => ({ url: 'https://youtube.com/@one' })),
    });
    const invalidRole = Object.assign(new BulkCreateResearchSourcesDto(), {
      projectId,
      sourceType: ResearchSourceType.YOUTUBE,
      defaultRole: 'invalid',
      sources: [{ url: 'https://youtube.com/@one' }],
    });

    expect(await validate(oversized)).not.toHaveLength(0);
    expect(await validate(invalidRole)).not.toHaveLength(0);
  });
});
