import { Module } from '@nestjs/common';

import { StorageModule } from '../../storage/storage.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { IngestionService } from './ingestion.service';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { OpportunityDetectionService } from './opportunity-detection.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';

@Module({
  imports: [StorageModule],
  controllers: [ResearchController, SignalController, OpportunityController],
  providers: [ResearchService, IngestionService, SignalService, OpportunityDetectionService, OpportunityService],
})
export class ResearchModule {}
