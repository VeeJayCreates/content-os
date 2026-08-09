import { Module } from '@nestjs/common';

import { storageProviders } from './storage.providers';
import {
  ContentRepository,
  ProjectRepository,
  ResearchSourceRepository,
} from '@content-os/storage';

@Module({
  providers: [...storageProviders],
  exports: [ContentRepository, ProjectRepository, ResearchSourceRepository],
})
export class StorageModule {}
