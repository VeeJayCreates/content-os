import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ProjectRepository } from '@content-os/storage';

import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
  ) {}

  async findAll() {
    return this.projectRepository.findAll();
  }

  async findOne(id: string) {
    const project = await this.projectRepository.findById(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async create(dto: CreateProjectDto) {
    return this.projectRepository.create({
      name: dto.name,
      description: dto.description,
      contentType: dto.contentType,
      status: dto.status,
    });
  }

  async remove(id: string) {
    const project = await this.projectRepository.findById(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.projectRepository.delete(id);

    return {
      success: true,
    };
  }
}