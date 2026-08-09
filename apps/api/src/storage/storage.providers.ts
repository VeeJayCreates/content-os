import {
  ContentRepository,
  ProjectRepository,
  ResearchSourceRepository,
  SignalRepository,
  OpportunityRepository,
  OpportunityMetricRepository,
  ResearchPackageRepository,
  TopicSelectionRepository,
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
  { provide: SignalRepository, useFactory: () => new SignalRepository() },
  {
    provide: OpportunityRepository,
    useFactory: () => new OpportunityRepository(),
  },
  {
    provide: OpportunityMetricRepository,
    useFactory: () => new OpportunityMetricRepository(),
  },
  {
    provide: ResearchPackageRepository,
    useFactory: () => new ResearchPackageRepository(),
  },
  {
    provide: TopicSelectionRepository,
    useFactory: () => new TopicSelectionRepository(),
  },
];
