import { Injectable } from '@nestjs/common';

@Injectable()
export class ProjectService {
  private readonly projects = [
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
    return this.projects.find((project) => project.id === id);
  }
}
