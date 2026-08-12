import { Module } from '@nestjs/common';

import { storageProviders } from './storage.providers';
import {
  ContentRepository,
  ProjectRepository,
  ProjectEditorialProfileRepository,
  ResearchSourceRepository,
  SignalRepository,
  OpportunityRepository,
  OpportunityMetricRepository,
  EditorialAssessmentRepository,
  ResearchPackageRepository,
  TopicSelectionRepository,
  AiExecutionRepository,
  TopicCandidateRepository,
  SemanticEmbeddingCacheRepository,
  ResearchExpansionRepository,
  ProductionQueueRepository,
} from '@content-os/storage';

@Module({
  providers: [...storageProviders],
  exports: [
    ContentRepository,
    ProjectRepository,
    ProjectEditorialProfileRepository,
    ResearchSourceRepository,
    SignalRepository,
    OpportunityRepository,
    OpportunityMetricRepository,
    EditorialAssessmentRepository,
    ResearchPackageRepository,
    TopicSelectionRepository,
    AiExecutionRepository,
    TopicCandidateRepository,
    SemanticEmbeddingCacheRepository,
    ResearchExpansionRepository,
    ProductionQueueRepository,
  ],
})
export class StorageModule {}
