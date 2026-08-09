import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  EditorialTimelinessPreference,
  ProjectEditorialProfile,
  ProjectEditorialProfileUpdateInput,
} from '@content-os/contracts';
import {
  ProjectEditorialProfile as StoredProjectEditorialProfile,
  ProjectEditorialProfileRepository,
  ProjectRepository,
} from '@content-os/storage';

import { UpdateProjectEditorialProfileDto } from './dto/update-project-editorial-profile.dto';

@Injectable()
export class ProjectEditorialProfileService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly profiles: ProjectEditorialProfileRepository,
  ) {}

  async get(projectId: string): Promise<ProjectEditorialProfile> {
    await this.ensureProjectExists(projectId);

    try {
      return this.toContract(await this.profiles.getOrCreateDefault(projectId));
    } catch {
      throw new InternalServerErrorException(
        'Unable to load the project editorial profile',
      );
    }
  }

  async update(
    projectId: string,
    dto: UpdateProjectEditorialProfileDto,
  ): Promise<ProjectEditorialProfile> {
    await this.ensureProjectExists(projectId);

    try {
      return this.toContract(
        await this.profiles.update(projectId, this.toUpdateInput(dto)),
      );
    } catch {
      throw new InternalServerErrorException(
        'Unable to update the project editorial profile',
      );
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    if (!(await this.projects.findById(projectId))) {
      throw new NotFoundException('Project not found');
    }
  }

  private toUpdateInput(
    dto: UpdateProjectEditorialProfileDto,
  ): ProjectEditorialProfileUpdateInput {
    return {
      ...(dto.mission !== undefined ? { mission: dto.mission } : {}),
      ...(dto.targetAudience !== undefined
        ? { targetAudience: dto.targetAudience }
        : {}),
      ...(dto.primaryLanguage !== undefined
        ? { primaryLanguage: dto.primaryLanguage }
        : {}),
      ...(dto.primaryGeography !== undefined
        ? { primaryGeography: dto.primaryGeography }
        : {}),
      ...(dto.topicThemes !== undefined ? { topicThemes: dto.topicThemes } : {}),
      ...(dto.excludedTopics !== undefined
        ? { excludedTopics: dto.excludedTopics }
        : {}),
      ...(dto.contentGoals !== undefined
        ? { contentGoals: dto.contentGoals }
        : {}),
      ...(dto.preferredFormats !== undefined
        ? { preferredFormats: dto.preferredFormats }
        : {}),
      ...(dto.timelinessPreference !== undefined
        ? { timelinessPreference: dto.timelinessPreference }
        : {}),
    };
  }

  private toContract(
    record: StoredProjectEditorialProfile,
  ): ProjectEditorialProfile {
    const timelinessPreference = Object.values(
      EditorialTimelinessPreference,
    ).find((value) => value === record.timelinessPreference);

    if (!timelinessPreference) {
      throw new InternalServerErrorException(
        'The project editorial profile is invalid',
      );
    }

    return {
      ...record,
      topicThemes: [...record.topicThemes],
      excludedTopics: [...record.excludedTopics],
      contentGoals: [...record.contentGoals],
      preferredFormats: [...record.preferredFormats],
      timelinessPreference,
    };
  }
}
