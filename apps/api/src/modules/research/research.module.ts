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
import { ResearchPackageController } from './research-package.controller';
import { ResearchPackageService } from './research-package.service';

@Module({
  imports: [StorageModule],
  controllers: [
    ResearchController,
    SignalController,
    OpportunityController,
    ResearchPackageController,
  ],
  providers: [
    ResearchService,
    IngestionService,
    SignalService,
    OpportunityDetectionService,
    OpportunityService,
    ResearchPackageService,
  ],
})
export class ResearchModule {}
