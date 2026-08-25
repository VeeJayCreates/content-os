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
import { VisualAssetManifestController } from './visual-asset-manifest.controller';
import { VisualAssetRuntimeService } from './visual-asset-runtime.service';
import { VisualAssetAcquisitionService } from './visual-asset-acquisition.service';
import { VisualAssetAcquisitionProviderRegistry } from './visual-asset-acquisition-provider.registry';
import { PexelsVisualAssetProvider } from './pexels-visual-asset.provider';
import { VisualAssetAcquisitionWorkflowService } from './visual-asset-acquisition-workflow.service';
import { EDITORIAL_ASSESSMENT_EVALUATOR, OpenAiEditorialAssessmentEvaluator } from './editorial-assessment.evaluator';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { ExternalResearchDiscoveryService } from './external-research-discovery.service';
import { YouTubeResearchSearchProvider } from './youtube-research-search.provider';
import { EXTERNAL_RESEARCH_SEARCH_PROVIDER } from './external-research-discovery.tokens';

@Module({
  imports: [StorageModule, AiRuntimeModule, AgentRuntimeModule],
  controllers: [
    ResearchController,
    SignalController,
    OpportunityController,
    ResearchPackageController,
    TopicSelectionController,
    EditorialAssessmentController,
    ScenePlanningController,
    VisualAssetManifestController,
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
    ExternalResearchDiscoveryService,
    YouTubeResearchSearchProvider,
    {
      provide: EXTERNAL_RESEARCH_SEARCH_PROVIDER,
      useExisting: YouTubeResearchSearchProvider,
    },
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
    VisualAssetRuntimeService,
    VisualAssetAcquisitionService,
    VisualAssetAcquisitionProviderRegistry,
    PexelsVisualAssetProvider,
    VisualAssetAcquisitionWorkflowService,
    OpenAiEditorialAssessmentEvaluator,
    { provide: EDITORIAL_ASSESSMENT_EVALUATOR, useExisting: OpenAiEditorialAssessmentEvaluator },
  ],
})
export class ResearchModule {}
