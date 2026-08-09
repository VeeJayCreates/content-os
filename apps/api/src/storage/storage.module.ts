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
  ResearchPackageRepository,
  TopicSelectionRepository,
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
    ResearchPackageRepository,
    TopicSelectionRepository,
  ],
})
export class StorageModule {}
