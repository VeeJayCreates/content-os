import { Module } from '@nestjs/common';

import { StorageModule } from '../../storage/storage.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

@Module({
  imports: [StorageModule],
  controllers: [ResearchController],
  providers: [ResearchService],
})
export class ResearchModule {}
