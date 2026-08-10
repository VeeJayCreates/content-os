import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResearchSourceRole, ResearchSourceType } from '@content-os/contracts';
import type { BulkCreateResearchSourcesResult, BulkResearchSourceResult, ResearchSource } from '@content-os/contracts';
import {
  ProjectRepository,
  ResearchSourceRepository,
  ResearchSourceWithProject,
} from '@content-os/storage';

import { CreateResearchSourceDto } from './dto/create-research-source.dto';
import { BulkCreateResearchSourcesDto } from './dto/bulk-create-research-sources.dto';
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
      role: dto.role ?? ResearchSourceRole.BOTH,
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
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.url ? { url: dto.url.trim() } : {}),
    });

    return this.toResearchSource(record!);
  }

  async bulkCreate(
    dto: BulkCreateResearchSourcesDto,
  ): Promise<BulkCreateResearchSourcesResult> {
    await this.ensureProjectExists(dto.projectId);

    const results: BulkResearchSourceResult[] = [];
    const seenUrls = new Set<string>();

    for (const item of dto.sources) {
      const inputUrl = item.url.trim();
      const role = this.bulkRole(item.role, dto.defaultRole);
      if (!role) {
        results.push({
          inputUrl,
          status: 'failed',
          errorCode: 'invalid_role',
          message: 'Source role must be discovery, verification, or both.',
        });
        continue;
      }

      const prepared = await this.prepareBulkSource(dto.sourceType, inputUrl);
      if ('error' in prepared) {
        results.push({ inputUrl, status: 'failed', ...prepared.error });
        continue;
      }

      if (seenUrls.has(prepared.url)) {
        results.push({
          inputUrl,
          status: 'existing',
          errorCode: 'duplicate_in_batch',
          message: 'This source appears more than once in the submitted batch.',
        });
        continue;
      }
      seenUrls.add(prepared.url);

      const existing = await this.researchSourceRepository.findByProjectAndUrl(
        dto.projectId,
        prepared.url,
      );
      if (existing) {
        results.push({
          inputUrl,
          status: 'existing',
          source: this.toResearchSource(existing),
          message: 'A Research Source with this URL already exists for this Project.',
        });
        continue;
      }

      try {
        const source = await this.researchSourceRepository.create({
          projectId: dto.projectId,
          name: prepared.name,
          sourceType: dto.sourceType,
          role,
          url: prepared.url,
          enabled: true,
        });
        results.push({ inputUrl, status: 'added', source: this.toResearchSource(source) });
      } catch {
        results.push({
          inputUrl,
          status: 'failed',
          errorCode: 'create_failed',
          message: 'Unable to create this Research Source.',
        });
      }
    }

    return {
      total: results.length,
      added: results.filter((result) => result.status === 'added').length,
      existing: results.filter((result) => result.status === 'existing').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    };
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

  private bulkRole(
    value: string | undefined,
    defaultRole: ResearchSourceRole,
  ): ResearchSourceRole | undefined {
    const role = value?.trim() || defaultRole;
    return Object.values(ResearchSourceRole).includes(role as ResearchSourceRole)
      ? (role as ResearchSourceRole)
      : undefined;
  }

  private async prepareBulkSource(
    sourceType: ResearchSourceType,
    inputUrl: string,
  ): Promise<
    | { url: string; name: string }
    | { error: Pick<BulkResearchSourceResult, 'errorCode' | 'message'> }
  > {
    if (!inputUrl) {
      return { error: { errorCode: 'invalid_url', message: 'Source URL is required.' } };
    }

    if (sourceType === ResearchSourceType.YOUTUBE) {
      try {
        this.youtubeChannelResolver.validate(inputUrl);
      } catch {
        return { error: { errorCode: 'invalid_url', message: 'Invalid YouTube channel URL.' } };
      }

      try {
        const identity = await this.youtubeChannelResolver.resolve(inputUrl);
        return {
          url: identity.canonicalUrl,
          name: identity.channelName,
        };
      } catch {
        return {
          error: {
            errorCode: 'unresolved_youtube_channel',
            message: 'Unable to resolve YouTube channel.',
          },
        };
      }
    }

    try {
      const url = new URL(inputUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return { url: url.toString(), name: url.hostname.replace(/^www\./i, '') };
    } catch {
      return { error: { errorCode: 'invalid_url', message: 'Invalid HTTP(S) URL.' } };
    }
  }

  private toResearchSource(record: ResearchSourceWithProject): ResearchSource {
    return {
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      sourceType: record.sourceType as ResearchSourceType,
      role: record.role as ResearchSourceRole,
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
