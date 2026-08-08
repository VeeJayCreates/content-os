import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Content,
  ContentStatus,
  ContentType,
} from '@content-os/contracts';
import {
  ContentRepository,
  ContentWithProject,
  ProjectRepository,
} from '@content-os/storage';

import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Injectable()
export class ContentService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async findAll(projectId?: string): Promise<Content[]> {
    const records = await this.contentRepository.findAll(projectId);

    return records.map((record) => this.toContent(record));
  }

  async findOne(id: string): Promise<Content> {
    const record = await this.contentRepository.findById(id);

    if (!record) {
      throw new NotFoundException('Content not found');
    }

    return this.toContent(record);
  }

  async create(dto: CreateContentDto): Promise<Content> {
    await this.ensureProjectExists(dto.projectId);

    const record = await this.contentRepository.create({
      projectId: dto.projectId,
      title: dto.title,
      contentType: dto.contentType,
      body: dto.body,
      status: dto.status,
    });

    return this.toContent(record);
  }

  async update(id: string, dto: UpdateContentDto): Promise<Content> {
    const existing = await this.contentRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Content not found');
    }

    if (dto.projectId && dto.projectId !== existing.projectId) {
      await this.ensureProjectExists(dto.projectId);
    }

    const record = await this.contentRepository.update(id, dto);

    return this.toContent(record!);
  }

  async remove(id: string): Promise<{ success: true }> {
    const existing = await this.contentRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Content not found');
    }

    await this.contentRepository.delete(id);

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

  private toContent(record: ContentWithProject): Content {
    return {
      id: record.id,
      projectId: record.projectId,
      title: record.title,
      contentType: record.contentType as ContentType,
      status: record.status as ContentStatus,
      body: record.body,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      project: {
        id: record.projectId,
        name: record.projectName,
      },
    };
  }
}
