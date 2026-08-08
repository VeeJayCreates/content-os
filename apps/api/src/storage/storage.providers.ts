import { ContentRepository, ProjectRepository } from '@content-os/storage';

export const storageProviders = [
  {
    provide: ProjectRepository,
    useFactory: () => new ProjectRepository(),
  },
  {
    provide: ContentRepository,
    useFactory: () => new ContentRepository(),
  },
];
