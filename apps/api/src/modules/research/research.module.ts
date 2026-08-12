import { Module } from '@nestjs/common';

import { StorageModule } from '../../storage/storage.module';
import { AiRuntimeModule } from '../ai/ai-runtime.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { IngestionService } from './ingestion.service';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { OpportunityDetectionService } from './opportunity-detection.service';
import { SemanticTopicClusteringService } from './semantic-topic-clustering.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';
import { ResearchPackageController } from './research-package.controller';
import { ResearchPackageService } from './research-package.service';
import { OpportunityEvidenceService } from './opportunity-evidence.service';
import { ResearchExpansionService } from './research-expansion.service';
import { TopicSelectionController } from './topic-selection.controller';
import { TopicSelectionService } from './topic-selection.service';
import { YouTubeChannelResolver } from './youtube-channel-resolver';
import { YouTubeIngestionAdapter } from './youtube-ingestion.adapter';
import { EditorialAssessmentController } from './editorial-assessment.controller';
import { EditorialAssessmentService } from './editorial-assessment.service';
import { EDITORIAL_ASSESSMENT_EVALUATOR, OpenAiEditorialAssessmentEvaluator } from './editorial-assessment.evaluator';

@Module({
  imports: [StorageModule, AiRuntimeModule],
  controllers: [
    ResearchController,
    SignalController,
    OpportunityController,
    ResearchPackageController,
    TopicSelectionController,
    EditorialAssessmentController,
  ],
  providers: [
    ResearchService,
    IngestionService,
    SignalService,
    OpportunityDetectionService,
    SemanticTopicClusteringService,
    OpportunityService,
    OpportunityEvidenceService,
    ResearchExpansionService,
    ResearchPackageService,
    TopicSelectionService,
    YouTubeChannelResolver,
    YouTubeIngestionAdapter,
    EditorialAssessmentService,
    OpenAiEditorialAssessmentEvaluator,
    { provide: EDITORIAL_ASSESSMENT_EVALUATOR, useExisting: OpenAiEditorialAssessmentEvaluator },
  ],
})
export class ResearchModule {}
