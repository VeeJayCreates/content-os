import { Module } from '@nestjs/common';

import { storageProviders } from './storage.providers';
import { ProjectRepository } from '@content-os/storage';

@Module({
  providers: [...storageProviders],
  exports: [ProjectRepository],
})
export class StorageModule {}