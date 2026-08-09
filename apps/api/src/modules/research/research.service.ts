import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResearchSourceType } from '@content-os/contracts';
import type { ResearchSource } from '@content-os/contracts';
import {
  ProjectRepository,
  ResearchSourceRepository,
  ResearchSourceWithProject,
} from '@content-os/storage';

import { CreateResearchSourceDto } from './dto/create-research-source.dto';
import { UpdateResearchSourceDto } from './dto/update-research-source.dto';
import { YouTubeChannelResolver } from './youtube-channel-resolver';

@Injectable()
export class ResearchService {
  constructor(
    private readonly researchSourceRepository: ResearchSourceRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly youtubeChannelResolver: YouTubeChannelResolver,
  ) {}

  async findAll(projectId?: string): Promise<ResearchSource[]> {
    const records = await this.researchSourceRepository.findAll(projectId);

    return records.map((record) => this.toResearchSource(record));
  }

  async findOne(id: string): Promise<ResearchSource> {
    const record = await this.researchSourceRepository.findById(id);

    if (!record) {
      throw new NotFoundException('Research source not found');
    }

    return this.toResearchSource(record);
  }

  async create(dto: CreateResearchSourceDto): Promise<ResearchSource> {
    await this.ensureProjectExists(dto.projectId);
    const url = dto.url.trim();
    this.validateSourceUrl(dto.sourceType, url);
    await this.ensureUniqueUrl(dto.projectId, url);

    const record = await this.researchSourceRepository.create({
      projectId: dto.projectId,
      name: dto.name.trim(),
      sourceType: dto.sourceType,
      url,
      enabled: dto.enabled,
    });

    return this.toResearchSource(record);
  }

  async update(
    id: string,
    dto: UpdateResearchSourceDto,
  ): Promise<ResearchSource> {
    const existing = await this.researchSourceRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Research source not found');
    }

    const projectId = dto.projectId ?? existing.projectId;
    const url = dto.url?.trim() ?? existing.url;
    const sourceType = dto.sourceType ?? (existing.sourceType as ResearchSourceType);

    if (dto.projectId && dto.projectId !== existing.projectId) {
      await this.ensureProjectExists(dto.projectId);
    }

    this.validateSourceUrl(sourceType, url);

    if (projectId !== existing.projectId || url !== existing.url) {
      await this.ensureUniqueUrl(projectId, url, id);
    }

    const record = await this.researchSourceRepository.update(id, {
      ...dto,
      name: dto.name?.trim(),
      url: dto.url?.trim(),
    });

    return this.toResearchSource(record!);
  }

  async remove(id: string): Promise<{ success: true }> {
    const existing = await this.researchSourceRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Research source not found');
    }

    await this.researchSourceRepository.delete(id);

    return { success: true };
  }

  private async ensureProjectExists(projectId: string) {
    const project = (await this.projectRepository.findById(projectId)) as
      | { id: string }
      | undefined;

    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  private async ensureUniqueUrl(
    projectId: string,
    url: string,
    ignoredId?: string,
  ) {
    const existing = await this.researchSourceRepository.findByProjectAndUrl(
      projectId,
      url,
    );

    if (existing && existing.id !== ignoredId) {
      throw new ConflictException(
        'A research source with this URL already exists for the project',
      );
    }
  }

  private validateSourceUrl(sourceType: ResearchSourceType, url: string) {
    if (sourceType === ResearchSourceType.YOUTUBE) {
      this.youtubeChannelResolver.validate(url);
    }
  }

  private toResearchSource(record: ResearchSourceWithProject): ResearchSource {
    return {
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      sourceType: record.sourceType as ResearchSourceType,
      url: record.url,
      enabled: record.enabled,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      project: {
        id: record.projectId,
        name: record.projectName,
      },
    };
  }
}
