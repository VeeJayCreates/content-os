import {
  ContentRepository,
  ContentStyleProfileRepository,
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
  AiBatchRepository,
  ContentScriptRepository,
  TopicCandidateRepository,
  SemanticEmbeddingCacheRepository,
  ResearchExpansionRepository,
  ProductionQueueRepository,
  ScenePlanRepository,
  AudioGenerationRepository,
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
  { provide: ContentStyleProfileRepository, useFactory: () => new ContentStyleProfileRepository() },
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
  { provide: AiBatchRepository, useFactory: () => new AiBatchRepository() },
  { provide: ContentScriptRepository, useFactory: () => new ContentScriptRepository() },
  { provide: TopicCandidateRepository, useFactory: () => new TopicCandidateRepository() },
  { provide: SemanticEmbeddingCacheRepository, useFactory: () => new SemanticEmbeddingCacheRepository() },
  { provide: ResearchExpansionRepository, useFactory: () => new ResearchExpansionRepository() },
  { provide: ProductionQueueRepository, useFactory: () => new ProductionQueueRepository() },
  { provide: ScenePlanRepository, useFactory: () => new ScenePlanRepository() },
  { provide: AudioGenerationRepository, useFactory: () => new AudioGenerationRepository() },
];
