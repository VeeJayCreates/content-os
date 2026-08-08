import { ProjectRepository } from '@content-os/storage';

export const storageProviders = [
  {
    provide: ProjectRepository,
    useFactory: () => new ProjectRepository(),
  },
];