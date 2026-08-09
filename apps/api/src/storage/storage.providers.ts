import {
  ContentRepository,
  ProjectRepository,
  ResearchSourceRepository,
} from '@content-os/storage';

export const storageProviders = [
  {
    provide: ProjectRepository,
    useFactory: () => new ProjectRepository(),
  },
  {
    provide: ContentRepository,
    useFactory: () => new ContentRepository(),
  },
  {
    provide: ResearchSourceRepository,
    useFactory: () => new ResearchSourceRepository(),
  },
];
