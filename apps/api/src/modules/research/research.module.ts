import { Module } from '@nestjs/common';

import { StorageModule } from '../../storage/storage.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { IngestionService } from './ingestion.service';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';

@Module({
  imports: [StorageModule],
  controllers: [ResearchController, SignalController],
  providers: [ResearchService, IngestionService, SignalService],
})
export class ResearchModule {}
