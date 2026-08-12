import {
  ContentRepository,
  ProjectRepository,
  ResearchSourceRepository,
  SignalRepository,
  OpportunityRepository,
  OpportunityMetricRepository,
  EditorialAssessmentRepository,
  ProjectEditorialProfileRepository,
  ResearchPackageRepository,
  TopicSelectionRepository,
  AiExecutionRepository,
  TopicCandidateRepository,
  SemanticEmbeddingCacheRepository,
} from '@content-os/storage';

export const storageProviders = [
  {
    provide: ProjectRepository,
    useFactory: () => new ProjectRepository(),
  },
  {
    provide: ProjectEditorialProfileRepository,
    useFactory: () => new ProjectEditorialProfileRepository(),
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
  { provide: EditorialAssessmentRepository, useFactory: () => new EditorialAssessmentRepository() },
  {
    provide: ResearchPackageRepository,
    useFactory: () => new ResearchPackageRepository(),
  },
  {
    provide: TopicSelectionRepository,
    useFactory: () => new TopicSelectionRepository(),
  },
  { provide: AiExecutionRepository, useFactory: () => new AiExecutionRepository() },
  { provide: TopicCandidateRepository, useFactory: () => new TopicCandidateRepository() },
  { provide: SemanticEmbeddingCacheRepository, useFactory: () => new SemanticEmbeddingCacheRepository() },
];
