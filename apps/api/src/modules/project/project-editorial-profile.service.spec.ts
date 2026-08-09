import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('@content-os/contracts', () => ({
  EditorialTimelinessPreference: {
    BREAKING: 'breaking',
    BALANCED: 'balanced',
    EVERGREEN: 'evergreen',
  },
}));

jest.mock('@content-os/storage', () => ({
  ProjectRepository: class ProjectRepository {},
  ProjectEditorialProfileRepository: class ProjectEditorialProfileRepository {},
}));

import { UpdateProjectEditorialProfileDto } from './dto/update-project-editorial-profile.dto';
import { ProjectEditorialProfileService } from './project-editorial-profile.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const defaultProfile = {
  projectId,
  mission: '',
  targetAudience: '',
  primaryLanguage: '',
  primaryGeography: '',
  topicThemes: [],
  excludedTopics: [],
  contentGoals: [],
  preferredFormats: [],
  timelinessPreference: 'balanced',
  revision: 0,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

describe('ProjectEditorialProfileService', () => {
  const projects = { findById: jest.fn() };
  const profiles = { getOrCreateDefault: jest.fn(), update: jest.fn() };
  const service = new ProjectEditorialProfileService(
    projects as never,
    profiles as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    projects.findById.mockResolvedValue({ id: projectId });
    profiles.getOrCreateDefault.mockResolvedValue(defaultProfile);
  });

  it('returns a persisted default profile for an existing Project', async () => {
    await expect(service.get(projectId)).resolves.toMatchObject({
      ...defaultProfile,
      revision: 0,
      timelinessPreference: 'balanced',
    });
    expect(profiles.getOrCreateDefault).toHaveBeenCalledWith(projectId);
  });

  it('creates and updates a profile through the single profile repository path', async () => {
    const created = {
      ...defaultProfile,
      mission: 'Explain global affairs clearly.',
      topicThemes: ['geopolitics'],
      revision: 1,
    };
    profiles.update.mockResolvedValue(created);

    await expect(
      service.update(projectId, {
        mission: created.mission,
        topicThemes: created.topicThemes,
      }),
    ).resolves.toMatchObject(created);
    expect(profiles.update).toHaveBeenCalledWith(projectId, {
      mission: created.mission,
      topicThemes: created.topicThemes,
    });
  });

  it('preserves unspecified fields and increments revision on a partial update', async () => {
    let persisted = { ...defaultProfile };
    profiles.update.mockImplementation(
      async (_projectId: string, update: Record<string, unknown>) => {
        persisted = {
          ...persisted,
          ...update,
          revision: persisted.revision + 1,
          updatedAt: '2026-08-10T01:00:00.000Z',
        };
        return persisted;
      },
    );

    await expect(
      service.update(projectId, { mission: 'A focused mission.' }),
    ).resolves.toMatchObject({
      mission: 'A focused mission.',
      targetAudience: '',
      revision: 1,
    });
    await expect(
      service.update(projectId, { primaryLanguage: 'English' }),
    ).resolves.toMatchObject({
      mission: 'A focused mission.',
      primaryLanguage: 'English',
      revision: 2,
    });
    expect(profiles.update).toHaveBeenCalledWith(projectId, {
      primaryLanguage: 'English',
    });
    expect(profiles.update.mock.calls.map((call) => call[0])).toEqual([
      projectId,
      projectId,
    ]);
  });

  it('rejects invalid enum, oversized text, and malformed array values', async () => {
    expect(
      await validate(
        plainToInstance(UpdateProjectEditorialProfileDto, {
          timelinessPreference: 'urgent',
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateProjectEditorialProfileDto, {
          mission: 'x'.repeat(1_001),
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateProjectEditorialProfileDto, {
          topicThemes: ['  '],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateProjectEditorialProfileDto, {
          topicThemes: null,
        }),
      ),
    ).not.toHaveLength(0);
  });

  it('returns 404 for a missing Project', async () => {
    projects.findById.mockResolvedValue(undefined);

    await expect(service.get(projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.update(projectId, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('converts persistence errors into controlled application errors', async () => {
    profiles.getOrCreateDefault.mockRejectedValue(new Error('sqlite failure'));
    profiles.update.mockRejectedValue(new Error('sqlite failure'));

    await expect(service.get(projectId)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(service.update(projectId, {})).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
