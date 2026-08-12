jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {}, ResearchSourceRepository: class ResearchSourceRepository {}, SignalRepository: class SignalRepository {}, TopicCandidateRepository: class TopicCandidateRepository {}, ResearchExpansionRepository: class ResearchExpansionRepository {}, ResearchPackageRepository: class ResearchPackageRepository {},
}));
jest.mock('@content-os/contracts', () => ({
  ResearchSourceRole: { VERIFICATION: 'verification', BOTH: 'both' },
  ResearchSourceType: { RSS: 'rss' },
  ResearchVerificationStatus: { INSUFFICIENT: 'insufficient', SINGLE_SOURCE: 'single_source', CORROBORATED: 'corroborated', CONFLICTING: 'conflicting' },
}));

import { ResearchExpansionService } from './research-expansion.service';

const opportunity = { id: 'topic-1', projectId: 'project-1' };
const verification = (status: string, sourceIds: string[] = ['source-a']) => ({ verificationStatus: status, evidenceSignalCount: sourceIds.length, distinctSourceCount: new Set(sourceIds).size, independentSourceCount: new Set(sourceIds).size, candidateClaimCount: 1, contradictionCount: 0, verificationReasons: [], canProceedAutomatically: status === 'corroborated' });
const detail = (status = 'single_source', sourceIds = ['source-a']) => ({ id: 'package-1', facts: [{ claim: 'India France FCAS' }], signals: sourceIds.map((researchSourceId, index) => ({ signalId: `signal-${index}`, researchSourceId })), verification: verification(status, sourceIds) });

describe('ResearchExpansionService', () => {
  const opportunities = { findById: jest.fn() };
  const sources = { findAll: jest.fn() };
  const signals = { findAll: jest.fn() };
  const candidates = { upsert: jest.fn(), attachToOpportunity: jest.fn() };
  const expansions = { findByOpportunityId: jest.fn(), upsert: jest.fn() };
  const packageRecords = { findByOpportunityId: jest.fn() };
  const ingestion = { ingest: jest.fn() };
  const packages = { generate: jest.fn(), findOne: jest.fn() };
  const evidence = { resolveOpportunityEvidence: jest.fn() };
  const service = new ResearchExpansionService(opportunities as never, sources as never, signals as never, candidates as never, expansions as never, packageRecords as never, ingestion as never, packages as never, evidence as never);

  beforeEach(() => {
    jest.resetAllMocks();
    opportunities.findById.mockResolvedValue(opportunity);
    packageRecords.findByOpportunityId.mockResolvedValue({ id: 'package-1' });
    packages.generate.mockResolvedValue({ packageId: 'package-1' });
    packages.findOne.mockResolvedValue(detail());
    sources.findAll.mockResolvedValue([{ id: 'source-b', name: 'Source B', enabled: true, sourceType: 'rss', role: 'verification' }]);
    expansions.findByOpportunityId.mockResolvedValue(undefined);
    ingestion.ingest.mockResolvedValue({ createdCount: 1 });
    signals.findAll.mockResolvedValue([{ id: 'signal-b', projectId: 'project-1', researchSourceId: 'source-b', title: 'India France FCAS', url: 'https://b.test', summary: null, discoveredAt: 'x' }]);
    candidates.upsert.mockResolvedValue({ id: 'candidate-b' });
    candidates.attachToOpportunity.mockResolvedValue(true);
    evidence.resolveOpportunityEvidence.mockResolvedValue({ kind: 'candidate', candidates: [{ candidateText: 'India France FCAS', signal: { id: 'signal-a', researchSourceId: 'source-a' } }], signals: [{ id: 'signal-a', researchSourceId: 'source-a' }] });
  });

  it.each(['corroborated', 'conflicting'])('does not expand %s topics', async (status) => {
    packages.findOne.mockResolvedValue(detail(status, status === 'corroborated' ? ['source-a', 'source-b'] : ['source-a']));
    const result = await service.expand('topic-1');
    expect(result.status).toBe('skipped');
    expect(ingestion.ingest).not.toHaveBeenCalled();
  });

  it('preserves an existing conflict by skipping before package regeneration or attempt writes', async () => {
    packages.findOne.mockResolvedValue(detail('conflicting'));
    const result = await service.expand('topic-1');
    expect(result.status).toBe('skipped');
    expect(result.verification.verificationStatus).toBe('conflicting');
    expect(packages.generate).not.toHaveBeenCalled();
    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(expansions.upsert).not.toHaveBeenCalled();
  });

  it.each(['single_source', 'insufficient'])('attempts expansion for %s topics', async (status) => {
    packages.findOne.mockResolvedValue(detail(status));
    const result = await service.expand('topic-1');
    expect(ingestion.ingest).toHaveBeenCalledWith('source-b');
    expect(result.sourcesSearched).toBe(1);
  });

  it('plans bounded expansion for an insufficient topic without first fabricating a package', async () => {
    packageRecords.findByOpportunityId.mockResolvedValue(undefined);
    evidence.resolveOpportunityEvidence.mockResolvedValue({ kind: 'candidate', candidates: [{ candidateText: 'India France FCAS', signal: { id: 'signal-a', researchSourceId: 'source-a' } }], signals: [] });
    signals.findAll.mockResolvedValue([{ id: 'signal-b', projectId: 'project-1', researchSourceId: 'source-b', title: 'Unrelated story', url: 'https://b.test', summary: null, discoveredAt: 'x' }]);
    const result = await service.expand('topic-1');
    expect(result.verification.verificationStatus).toBe('insufficient');
    expect(result.sourcesSearched).toBe(1);
    expect(ingestion.ingest).toHaveBeenCalledWith('source-b');
    expect(packages.generate).not.toHaveBeenCalled();
  });

  it('returns a controlled exhausted result when an insufficient topic lacks deterministic identity', async () => {
    packageRecords.findByOpportunityId.mockResolvedValue(undefined);
    evidence.resolveOpportunityEvidence.mockResolvedValue({ kind: 'candidate', candidates: [], signals: [] });
    const result = await service.expand('topic-1');
    expect(result).toMatchObject({ status: 'exhausted', verification: { verificationStatus: 'insufficient' } });
    expect(result.warnings[0]).toContain('insufficient deterministic identity');
    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(expansions.upsert).not.toHaveBeenCalled();
  });

  it('accepts only an exact candidate claim from a distinct source then re-verifies', async () => {
    packages.findOne.mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail('corroborated', ['source-a', 'source-b']));
    const result = await service.expand('topic-1');
    expect(candidates.attachToOpportunity).toHaveBeenCalledWith('topic-1', 'candidate-b');
    expect(result).toMatchObject({ status: 'expanded', candidateEvidenceAccepted: 1, verification: { verificationStatus: 'corroborated' } });
  });

  it('does not accept a sibling candidate from a multi-story signal', async () => {
    signals.findAll.mockResolvedValue([{ id: 'signal-b', projectId: 'project-1', researchSourceId: 'source-b', title: 'Japan F-2 | Honey Trap', url: 'https://b.test', summary: null, discoveredAt: 'x' }]);
    const result = await service.expand('topic-1');
    expect(candidates.attachToOpportunity).not.toHaveBeenCalled();
    expect(result.candidateEvidenceAccepted).toBe(0);
  });

  it('parks an unchanged exhausted plan without new provider work', async () => {
    expansions.findByOpportunityId.mockResolvedValue({ inputHash: 'old-input', attemptCount: 2 });
    await service.expand('topic-1');
    expect(ingestion.ingest).toHaveBeenCalledTimes(1);
    const state = expansions.upsert.mock.calls[0][0];
    expansions.findByOpportunityId.mockResolvedValue({ inputHash: state.inputHash, attemptCount: 2 });
    const second = await service.expand('topic-1');
    expect(second.status).toBe('exhausted');
  });

  it('isolates a source failure as a topic-level controlled result', async () => {
    ingestion.ingest.mockRejectedValue(new Error('upstream unavailable'));
    await expect(service.expand('topic-1')).resolves.toMatchObject({ status: 'exhausted', providerFailures: 1 });
  });

  it('continues with a subsequent topic after a topic-local refresh failure', async () => {
    ingestion.ingest.mockRejectedValueOnce(new Error('upstream unavailable'));
    await expect(service.expand('topic-1')).resolves.toMatchObject({ providerFailures: 1 });
    ingestion.ingest.mockResolvedValue({ createdCount: 0 });
    opportunities.findById.mockResolvedValue({ id: 'topic-2', projectId: 'project-1' });
    await expect(service.expand('topic-2')).resolves.toMatchObject({ opportunityId: 'topic-2', providerFailures: 0 });
  });
});
