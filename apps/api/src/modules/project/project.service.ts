import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectService {
  private projects = [
    {
      id: '1',
      name: 'Geo Rajneeti',
      description: 'India & World Geopolitics',
      contentType: 'geopolitics',
      status: 'draft',
    },
  ];

  findAll() {
    return this.projects;
  }

  findOne(id: string) {
    const project = this.projects.find((p) => p.id === id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  create(dto: CreateProjectDto) {
    const project = {
      id: crypto.randomUUID(),
      ...dto,
    };

    this.projects.push(project);

    return project;
  }

  remove(id: string) {
    const index = this.projects.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new NotFoundException('Project not found');
    }

    this.projects.splice(index, 1);

    return {
      success: true,
    };
  }
}