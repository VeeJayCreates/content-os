import { Module } from '@nestjs/common';

import { storageProviders } from './storage.providers';
import {
  ContentRepository,
  ProjectRepository,
  ResearchSourceRepository,
  SignalRepository,
  OpportunityRepository,
  ResearchPackageRepository,
} from '@content-os/storage';

@Module({
  providers: [...storageProviders],
  exports: [
    ContentRepository,
    ProjectRepository,
    ResearchSourceRepository,
    SignalRepository,
    OpportunityRepository,
    ResearchPackageRepository,
  ],
})
export class StorageModule {}
