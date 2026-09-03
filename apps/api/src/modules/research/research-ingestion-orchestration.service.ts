import { Injectable, Optional } from '@nestjs/common';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { NewVideoTopicService } from './new-video-topic.service';
import { TranscriptAcquisitionQueueService } from './transcript-acquisition-queue.service';

/** Connects established incremental topic creation to durable transcript work. */
@Injectable()
export class ResearchIngestionOrchestrationService {
  constructor(private readonly topics: NewVideoTopicService, private readonly transcriptQueue: TranscriptAcquisitionQueueService, @Optional() private readonly log?: ResearchExecutionLogger) {}

  async processNewSignals(projectId: string, signalIds: string[]) {
    const uniqueIds = [...new Set(signalIds)];
    const topics = await this.topics.process(projectId, uniqueIds);
    let transcriptJobsCreated = 0;
    let transcriptJobsSkipped = 0;
    for (const signalId of uniqueIds) {
      try {
        const result = await this.transcriptQueue.enqueue(projectId, signalId);
        if (result.created) transcriptJobsCreated += 1; else transcriptJobsSkipped += 1;
      } catch {
        transcriptJobsSkipped += 1;
        this.log?.withContext({ projectId, signalId }, () => this.log?.event('warn', 'research_ingestion_orchestration.transcript_enqueue', 'failed', { result: { failureCategory: 'transcript_enqueue_failed' } }));
      }
    }
    return { topics, transcriptJobsCreated, transcriptJobsSkipped };
  }
}
