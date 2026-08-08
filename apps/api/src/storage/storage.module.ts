import { Module } from '@nestjs/common';

import { storageProviders } from './storage.providers';
import { ContentRepository, ProjectRepository } from '@content-os/storage';

@Module({
  providers: [...storageProviders],
  exports: [ContentRepository, ProjectRepository],
})
export class StorageModule {}
