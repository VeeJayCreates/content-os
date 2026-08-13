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
import { ProductionQueueController } from './production-queue.controller';
import { ProductionQueueService } from './production-queue.service';
import { ProductionQueueContentAngleController } from './production-queue-content-angle.controller';
import { ProductionQueueContentAngleService } from './production-queue-content-angle.service';
import { ProductionQueueContentAngleBatchService } from './production-queue-content-angle-batch.service';
import { ScriptGenerationController } from './script-generation.controller';
import { ScriptGenerationService } from './script-generation.service';
import { ProductionQueueScriptBatchService } from './production-queue-script-batch.service';
import { TopicSelectionController } from './topic-selection.controller';
import { TopicSelectionService } from './topic-selection.service';
import { YouTubeChannelResolver } from './youtube-channel-resolver';
import { YouTubeIngestionAdapter } from './youtube-ingestion.adapter';
import { EditorialAssessmentController } from './editorial-assessment.controller';
import { EditorialAssessmentService } from './editorial-assessment.service';
import { ScenePlanningController } from './scene-planning.controller';
import { ScenePlanningService } from './scene-planning.service';
import { ScenePlanningBatchService } from './scene-planning-batch.service';
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
    ScenePlanningController,
    ProductionQueueController,
    ProductionQueueContentAngleController,
    ScriptGenerationController,
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
    ProductionQueueService,
    ProductionQueueContentAngleService,
    ProductionQueueContentAngleBatchService,
    ScriptGenerationService,
    ProductionQueueScriptBatchService,
    ResearchPackageService,
    TopicSelectionService,
    YouTubeChannelResolver,
    YouTubeIngestionAdapter,
    EditorialAssessmentService,
    ScenePlanningService,
    ScenePlanningBatchService,
    OpenAiEditorialAssessmentEvaluator,
    { provide: EDITORIAL_ASSESSMENT_EVALUATOR, useExisting: OpenAiEditorialAssessmentEvaluator },
  ],
})
export class ResearchModule {}
