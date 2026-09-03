jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {}, ResearchSourceRepository: class ResearchSourceRepository {}, SignalRepository: class SignalRepository {}, TopicCandidateRepository: class TopicCandidateRepository {}, ResearchExpansionRepository: class ResearchExpansionRepository {}, ResearchPackageRepository: class ResearchPackageRepository {},
}));
jest.mock('@content-os/contracts', () => ({
  ResearchSourceRole: { VERIFICATION: 'verification', BOTH: 'both' },
  ResearchSourceType: { RSS: 'rss' },
  ResearchVerificationStatus: { INSUFFICIENT: 'insufficient', SINGLE_SOURCE: 'single_source', CORROBORATED: 'corroborated', CONFLICTING: 'conflicting' },
}));

import { ResearchExpansionService } from './research-expansion.service';
import { ExternalResearchSearchError } from './external-research-discovery.types';

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
  const semanticClustering = { cluster: jest.fn() };
  const externalDiscovery = { discover: jest.fn() };
  const service = new ResearchExpansionService(
    opportunities as never,
    sources as never,
    signals as never,
    candidates as never,
    expansions as never,
    packageRecords as never,
    ingestion as never,
    packages as never,
    evidence as never,
    semanticClustering as never,
    externalDiscovery as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    semanticClustering.cluster.mockResolvedValue([]);
    externalDiscovery.discover.mockResolvedValue({ queriesPlanned: 0, acceptedResults: 0, results: [], });
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

  it('re-verifies when relevant evidence is already attached to the opportunity', async () => {
    candidates.attachToOpportunity.mockResolvedValue(false);

    packages.findOne
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail('corroborated', ['source-a', 'source-b']),
      );

    const result = await service.expand('topic-1');

    expect(candidates.attachToOpportunity).toHaveBeenCalled();

    expect(packages.generate).toHaveBeenCalledWith('topic-1');

    expect(result).toMatchObject({
      status: 'expanded',
      candidateEvidenceAccepted: 0,
      duplicateEvidenceRejected: 1,
      verification: {
        verificationStatus: 'corroborated',
      },
    });
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

  it('uses the existing candidate identity when a weak package has no extracted facts', async () => {
    packages.findOne.mockResolvedValue({ ...detail('insufficient'), facts: [] });
    const result = await service.expand('topic-1');
    expect(ingestion.ingest).toHaveBeenCalledWith('source-b');
    expect(result.sourcesSearched).toBe(1);
  });

  it('uses a candidate topic identity for discovery without promoting headline framing to a fact', async () => {
    packages.findOne.mockResolvedValue({ ...detail('insufficient'), facts: [] });
    evidence.resolveOpportunityEvidence.mockResolvedValue({ kind: 'candidate', candidates: [{ candidateText: 'Hormuz becomes a bargaining chip', signal: { id: 'signal-a', researchSourceId: 'source-a' } }], signals: [{ id: 'signal-a', researchSourceId: 'source-a' }] });
    await service.expand('topic-1');
    expect(ingestion.ingest).toHaveBeenCalledWith('source-b');
  });

  it('does not use editorial headline framing as an external discovery query', async () => {
    packages.findOne.mockResolvedValue({
      ...detail(),
      facts: [{ claim: 'Hormuz Become Iran Big Bargaining Chip' }],
    });
    evidence.resolveOpportunityEvidence.mockResolvedValue({ kind: 'legacy', signals: [] });

    const result = await service.expand('topic-1');

    expect(result).toMatchObject({ status: 'exhausted' });
    expect(result.warnings[0]).toContain('insufficient deterministic identity');
    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(externalDiscovery.discover).not.toHaveBeenCalled();
  });

  it('accepts only an exact candidate claim from a distinct source then re-verifies', async () => {
    packages.findOne.mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail('corroborated', ['source-a', 'source-b']));
    const result = await service.expand('topic-1');
    expect(candidates.attachToOpportunity).toHaveBeenCalledWith('topic-1', 'candidate-b');
    expect(result).toMatchObject({ status: 'expanded', candidateEvidenceAccepted: 1, verification: { verificationStatus: 'corroborated' } });
  });

  it('accepts a semantically confirmed paraphrase from a distinct source then re-verifies', async () => {
    signals.findAll.mockResolvedValue([
      {
        id: 'signal-b',
        projectId: 'project-1',
        researchSourceId: 'source-b',
        title: 'France and India advance cooperation on the FCAS programme',
        url: 'https://b.test',
        summary: null,
        discoveredAt: 'x',
      },
    ]);

    semanticClustering.cluster.mockImplementation(async (inputs) => {
      const claim = inputs.find((input: { id: string }) =>
        input.id.startsWith('claim:'),
      );

      const candidate = inputs.find((input: { id: string }) =>
        input.id.startsWith('candidate:'),
      );

      if (!claim || !candidate) return [];

      return [
        {
          candidateIds: [claim.id, candidate.id],
          titleCandidateId: claim.id,
          clusterKey: 'cluster-1',
        },
      ];
    });

    packages.findOne
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail('corroborated', ['source-a', 'source-b']),
      );

    const result = await service.expand('topic-1');

    expect(semanticClustering.cluster).toHaveBeenCalled();
    expect(candidates.attachToOpportunity).toHaveBeenCalledWith(
      'topic-1',
      'candidate-b',
    );

    expect(result).toMatchObject({
      status: 'expanded',
      candidateEvidenceAccepted: 1,
      verification: {
        verificationStatus: 'corroborated',
      },
    });
  });

  it('falls back to external discovery when configured sources do not produce evidence', async () => {
    signals.findAll
      .mockResolvedValueOnce([
        {
          id: 'signal-b',
          projectId: 'project-1',
          researchSourceId: 'source-b',
          title: 'Unrelated story',
          url: 'https://b.test',
          summary: null,
          discoveredAt: 'x',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'signal-c',
          projectId: 'project-1',
          researchSourceId: 'source-c',
          title: 'France and India advance cooperation on the FCAS programme',
          url: 'https://reuters.com/story-c',
          summary: null,
          discoveredAt: 'x',
        },
      ]);

    externalDiscovery.discover.mockResolvedValue({
      queriesPlanned: 1,
      acceptedResults: 1,
      results: [
        {
          sourceId: 'source-c',
          url: 'https://reuters.com/story-c',
          title: 'France and India advance cooperation on the FCAS programme',
        },
      ],
    });

    semanticClustering.cluster.mockImplementation(async (inputs) => {
      const candidate = inputs.find((input: {
        id: string;
        text: string;
      }) => input.id.startsWith('candidate:'));

      if (
        !candidate ||
        candidate.text === 'Unrelated story'
      ) {
        return [];
      }

      const claim = inputs.find((input: {
        id: string;
        text: string;
      }) => input.id.startsWith('claim:'));

      if (!claim) return [];

      return [
        {
          candidateIds: [claim.id, candidate.id],
          titleCandidateId: claim.id,
          clusterKey: 'cluster-1',
        },
      ];
    });

    packages.findOne
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail('corroborated', ['source-a', 'source-c']),
      );

    const result = await service.expand('topic-1');

    expect(externalDiscovery.discover).toHaveBeenCalled();
    expect(candidates.attachToOpportunity).toHaveBeenCalledWith(
      'topic-1',
      'candidate-b',
    );

    expect(result.status).toBe('expanded');
  });

  it('records an exhausted attempt when external discovery is unavailable instead of throwing', async () => {
    signals.findAll.mockResolvedValue([]);
    externalDiscovery.discover.mockRejectedValue(new Error('transport unavailable'));
    const result = await service.expand('topic-1');
    expect(result).toMatchObject({ status: 'exhausted', providerFailures: 1 });
    expect(result.warnings).toContain('External discovery could not be reached for this bounded expansion attempt (transport_unavailable).');
    expect(expansions.upsert).toHaveBeenCalled();
  });

  it('preserves a safe local network-permission diagnostic without provider output', async () => {
    signals.findAll.mockResolvedValue([]);
    externalDiscovery.discover.mockRejectedValue(new ExternalResearchSearchError('local_network_permission_denied'));

    const result = await service.expand('topic-1');

    expect(result.warnings).toContain('External discovery could not be reached for this bounded expansion attempt (local_network_permission_denied).');
    expect(result.warnings.join(' ')).not.toContain('WinError');
  });

  it('rejects unrelated sibling candidates when semantic matching does not confirm them', async () => {
    signals.findAll.mockResolvedValue([
      {
        id: 'signal-b',
        projectId: 'project-1',
        researchSourceId: 'source-b',
        title: 'Japan F-2 | Honey Trap',
        url: 'https://b.test',
        summary: null,
        discoveredAt: 'x',
      },
    ]);

    semanticClustering.cluster.mockResolvedValue([]);

    const result = await service.expand('topic-1');

    expect(semanticClustering.cluster).toHaveBeenCalled();
    expect(candidates.upsert).not.toHaveBeenCalled();
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
