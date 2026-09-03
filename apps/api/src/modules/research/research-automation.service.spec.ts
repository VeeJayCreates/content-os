jest.mock('@content-os/contracts', () => ({
  ProjectStatus: { ACTIVE: 'active' },
  ResearchFactStatus: { SUPPORTED: 'supported' },
  ResearchLifecycleState: { REVIEW_READY: 'review_ready' },
}));
jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {}, ProjectRepository: class ProjectRepository {}, ResearchAutomationRepository: class ResearchAutomationRepository {}, ResearchPackageRepository: class ResearchPackageRepository {}, ResearchSourceRepository: class ResearchSourceRepository {}, TopicSelectionRepository: class TopicSelectionRepository {},
}));

import { ResearchAutomationService } from './research-automation.service';

describe('ResearchAutomationService', () => {
  const projects = { findById: jest.fn(), findAll: jest.fn() };
  const sources = { findAll: jest.fn() };
  const opportunities = { findAll: jest.fn() };
  const records = { findByOpportunityId: jest.fn(), findAll: jest.fn() };
  const selections = { findByOpportunityId: jest.fn() };
  const runs = { findByProjectId: jest.fn(), createIdle: jest.fn(), upsert: jest.fn() };
  const ingestion = { ingest: jest.fn() };
  const opportunityService = { detect: jest.fn() };
  const packages = { generate: jest.fn(), findOne: jest.fn() };
  const expansion = { expand: jest.fn() };
  const topicSelection = { evaluateOne: jest.fn() };
  const service = () => new ResearchAutomationService(projects as never, sources as never, opportunities as never, records as never, selections as never, runs as never, ingestion as never, opportunityService as never, packages as never, expansion as never, topicSelection as never);

  beforeEach(() => {
    jest.resetAllMocks();
    projects.findById.mockResolvedValue({ id: 'project-1', status: 'active' });
    sources.findAll.mockResolvedValue([{ id: 'source-1', name: 'Source 1', enabled: true }]);
    opportunities.findAll.mockResolvedValue([{ id: 'topic-1', title: 'Topic 1', status: 'detected', score: 80 }]);
    records.findByOpportunityId.mockResolvedValue(undefined);
    selections.findByOpportunityId.mockResolvedValue(undefined);
    topicSelection.evaluateOne.mockResolvedValue({ decision: 'hold' });
    runs.upsert.mockImplementation(async (value) => ({ ...value, createdAt: 'now', updatedAt: 'now' }));
  });

  it('runs bounded research stages and isolates a source failure', async () => {
    ingestion.ingest.mockRejectedValue(new Error('source unavailable'));
    await expect(service().runProject('project-1')).resolves.toMatchObject({ status: 'completed', opportunitiesProcessed: 1, providerFailures: 1 });
    expect(opportunityService.detect).toHaveBeenCalledWith('project-1');
    expect(packages.generate).toHaveBeenCalledWith('topic-1');
    expect(topicSelection.evaluateOne).toHaveBeenCalledWith('topic-1');
  });

  it('does not expand compatible review-ready packages again', async () => {
    records.findByOpportunityId.mockResolvedValue({ lifecycleState: 'review_ready' });
    await service().runProject('project-1');
    expect(expansion.expand).not.toHaveBeenCalled();
    expect(packages.generate).not.toHaveBeenCalled();
  });

  it('returns an existing run instead of starting a concurrent duplicate', async () => {
    const instance = service();
    records.findByOpportunityId.mockImplementation(() => new Promise(() => undefined));
    runs.findByProjectId.mockResolvedValue({ projectId: 'project-1', status: 'running' });
    void instance.runProject('project-1');
    await expect(instance.runProject('project-1')).resolves.toMatchObject({ status: 'running' });
  });

  it('prioritizes a genuinely new detected opportunity ahead of older backlog and evaluates its potential', async () => {
    const existing = { id: 'topic-old', title: 'Old topic', status: 'detected', score: 98 };
    const fresh = { id: 'topic-fresh', title: 'Fresh topic', status: 'detected', score: 40 };
    opportunities.findAll
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([existing, fresh]);
    const previousOpportunityBudget = process.env.RESEARCH_AUTOMATION_MAX_OPPORTUNITIES_PER_RUN;
    process.env.RESEARCH_AUTOMATION_MAX_OPPORTUNITIES_PER_RUN = '1';
    try {
      await service().runProject('project-1');

      expect(opportunityService.detect).toHaveBeenCalledWith('project-1');
      expect(topicSelection.evaluateOne).toHaveBeenCalledWith('topic-fresh');
      expect(packages.generate).toHaveBeenCalledWith('topic-fresh');
      expect(packages.generate).not.toHaveBeenCalledWith('topic-old', expect.anything());
    } finally {
      if (previousOpportunityBudget === undefined) delete process.env.RESEARCH_AUTOMATION_MAX_OPPORTUNITIES_PER_RUN;
      else process.env.RESEARCH_AUTOMATION_MAX_OPPORTUNITIES_PER_RUN = previousOpportunityBudget;
    }
  });

  it('exposes the persisted Topic Selection score and reason in a review-ready item', async () => {
    records.findAll.mockResolvedValue([{ id: 'package-1', opportunityId: 'topic-1', opportunityTitle: 'Topic 1', confidenceScore: 88, lifecycleState: 'review_ready', updatedAt: 'now' }]);
    packages.findOne.mockResolvedValue({ facts: [{ claim: 'Supported fact', status: 'supported' }], signals: [{ sourceName: 'Independent source' }], verification: { supportingContentCount: 3, evidenceRecordCount: 4, distinctSourceCount: 3, verificationStatus: 'corroborated', verificationReasons: [] } });
    selections.findByOpportunityId.mockResolvedValue({ selectionScore: 82, decision: 'selected', reason: 'Opportunity score 80 and research confidence 88 meet project thresholds.' });
    await expect(service().reviewQueue('project-1')).resolves.toEqual([expect.objectContaining({ contentPotentialScore: 82, contentPotentialRecommendation: 'selected', supportingEvidenceCount: 3, evidenceRecordCount: 4 })]);
  });
});
