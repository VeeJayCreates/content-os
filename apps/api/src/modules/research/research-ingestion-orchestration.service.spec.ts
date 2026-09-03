jest.mock('./new-video-topic.service', () => ({ NewVideoTopicService: class {} }));
jest.mock('./transcript-acquisition-queue.service', () => ({ TranscriptAcquisitionQueueService: class {} }));

import { ResearchIngestionOrchestrationService } from './research-ingestion-orchestration.service';

describe('ResearchIngestionOrchestrationService', () => {
  it('reuses batch topic creation and persists independent transcript work for every new signal', async () => {
    const topics = { process: jest.fn().mockResolvedValue({ topicsCreated: 2, failures: [] }) };
    const queue = { enqueue: jest.fn().mockResolvedValueOnce({ created: true }).mockResolvedValueOnce({ created: true }) };
    const service = new ResearchIngestionOrchestrationService(topics as never, queue as never);
    await expect(service.processNewSignals('project', ['signal-a', 'signal-b', 'signal-a'])).resolves.toMatchObject({ transcriptJobsCreated: 2, transcriptJobsSkipped: 0 });
    expect(topics.process).toHaveBeenCalledWith('project', ['signal-a', 'signal-b']);
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });

  it('does not let one transcript enqueue error roll back topic creation or other durable work', async () => {
    const topics = { process: jest.fn().mockResolvedValue({ topicsCreated: 2, failures: [] }) };
    const queue = { enqueue: jest.fn().mockRejectedValueOnce(new Error('storage')).mockResolvedValueOnce({ created: true }) };
    const service = new ResearchIngestionOrchestrationService(topics as never, queue as never);
    await expect(service.processNewSignals('project', ['signal-a', 'signal-b'])).resolves.toMatchObject({ transcriptJobsCreated: 1, transcriptJobsSkipped: 1 });
    expect(topics.process).toHaveBeenCalledTimes(1);
  });
});
