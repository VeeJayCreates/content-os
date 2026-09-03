import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectChannelRepository, ProjectRepository } from '@content-os/storage';

@Injectable()
export class ProjectChannelService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectChannelRepository: ProjectChannelRepository,
  ) {}

  async getHierarchy(projectId: string) {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const [productProfile, channels] = await Promise.all([
      this.projectChannelRepository.findProductProfileByProjectId(projectId),
      this.projectChannelRepository.findContentChannelsByProjectId(projectId),
    ]);

    return { productProfile: productProfile ?? null, channels };
  }
}
