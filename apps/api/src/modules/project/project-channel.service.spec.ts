import { NotFoundException } from '@nestjs/common';

jest.mock('@content-os/storage', () => ({
  ProjectRepository: class ProjectRepository {},
  ProjectChannelRepository: class ProjectChannelRepository {},
}));

import { ProjectChannelService } from './project-channel.service';

const projectId = '11111111-1111-4111-8111-111111111111';

describe('ProjectChannelService', () => {
  const projects = { findById: jest.fn() };
  const channels = {
    findProductProfileByProjectId: jest.fn(),
    findContentChannelsByProjectId: jest.fn(),
  };
  const service = new ProjectChannelService(projects as never, channels as never);

  beforeEach(() => {
    jest.resetAllMocks();
    projects.findById.mockResolvedValue({ id: projectId });
    channels.findProductProfileByProjectId.mockResolvedValue({
      projectId,
      name: 'Geo Rajneeti',
    });
    channels.findContentChannelsByProjectId.mockResolvedValue([
      { id: 'channel-1', projectId, name: 'Geo Rajneeti', slug: 'geo-rajneeti' },
    ]);
  });

  it('returns only the requested Project hierarchy', async () => {
    await expect(service.getHierarchy(projectId)).resolves.toEqual({
      productProfile: { projectId, name: 'Geo Rajneeti' },
      channels: [{ id: 'channel-1', projectId, name: 'Geo Rajneeti', slug: 'geo-rajneeti' }],
    });
    expect(channels.findProductProfileByProjectId).toHaveBeenCalledWith(projectId);
    expect(channels.findContentChannelsByProjectId).toHaveBeenCalledWith(projectId);
  });

  it('does not create a hierarchy for a missing Project', async () => {
    projects.findById.mockResolvedValue(undefined);

    await expect(service.getHierarchy(projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(channels.findProductProfileByProjectId).not.toHaveBeenCalled();
  });
});
