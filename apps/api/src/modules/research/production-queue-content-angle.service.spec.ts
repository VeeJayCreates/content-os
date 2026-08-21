jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class {},
  ProductionQueueRepository: class {},
  ProjectRepository: class {},
  ResearchPackageRepository: class {},
  TopicCandidateRepository: class {},
}));
jest.mock('@content-os/contracts', () => ({
  ProductionQueueStatus: { QUEUED: 'queued', PROCESSING: 'processing', FAILED: 'failed' },
  ResearchVerificationStatus: { CORROBORATED: 'corroborated', INSUFFICIENT: 'insufficient' },
}));
jest.mock('./research-verification', () => ({ evaluateResearchVerification: jest.fn() }));

import { ProductionQueueStatus, ResearchVerificationStatus } from '@content-os/contracts';
import { evaluateResearchVerification } from './research-verification';
import { ProductionQueueContentAngleService } from './production-queue-content-angle.service';

describe('ProductionQueueContentAngleService', () => {
  const queue = { findById: jest.fn(), updateStatus: jest.fn() };
  const projects = { findById: jest.fn() };
  const opportunities = { findById: jest.fn() };
  const packages = { findById: jest.fn(), findFactsWithEvidenceByPackageIds: jest.fn() };
  const candidates = { membershipCountsByOpportunityIds: jest.fn() };
  const editorial = { assessWithPackage: jest.fn(), findOneWithPackage: jest.fn() };
  const bridge = { synchronize: jest.fn() };
  const service = new ProductionQueueContentAngleService(queue as never, projects as never, opportunities as never, packages as never, candidates as never, editorial as never, bridge);

  const item = { id: 'queue-1', projectId: 'project-1', opportunityId: 'opportunity-1', researchPackageId: 'package-1', status: 'queued' };
  const opportunity = { id: 'opportunity-1', projectId: 'project-1', title: 'FCAS' };
  const researchPackage = { id: 'package-1', projectId: 'project-1', opportunityId: 'opportunity-1', status: 'ready' };
  const rows = [{ id: 'fact-1', normalizedClaimKey: 'fcas', status: 'supported', signalId: 'signal-1', researchSourceId: 'source-1' }];

  beforeEach(() => {
    jest.resetAllMocks();
    queue.findById.mockResolvedValue(item);
    projects.findById.mockResolvedValue({ id: 'project-1', status: 'active' });
    opportunities.findById.mockResolvedValue(opportunity);
    packages.findById.mockResolvedValue(researchPackage);
    packages.findFactsWithEvidenceByPackageIds.mockResolvedValue(new Map([['package-1', rows]]));
    candidates.membershipCountsByOpportunityIds.mockResolvedValue(new Map([['opportunity-1', 1]]));
    (evaluateResearchVerification as jest.Mock).mockReturnValue({ verificationStatus: ResearchVerificationStatus.CORROBORATED, canProceedAutomatically: true });
    editorial.assessWithPackage.mockResolvedValue({ id: 'assessment-1', status: 'ready' });
  });

  it('generates against the queue item’s exact ready Research Package and remains processing', async () => {
    await expect(service.generate('queue-1')).resolves.toMatchObject({ id: 'assessment-1' });

    expect(editorial.assessWithPackage).toHaveBeenCalledWith(opportunity, 'package-1');
    expect(queue.updateStatus).toHaveBeenNthCalledWith(1, 'queue-1', ProductionQueueStatus.PROCESSING);
    expect(queue.updateStatus).not.toHaveBeenCalledWith('queue-1', ProductionQueueStatus.FAILED);
    expect(bridge.synchronize).toHaveBeenCalledWith('queue-1');
  });

  it('does not call editorial generation when verification is not corroborated', async () => {
    (evaluateResearchVerification as jest.Mock).mockReturnValue({ verificationStatus: ResearchVerificationStatus.INSUFFICIENT, canProceedAutomatically: false });

    await expect(service.generate('queue-1')).rejects.toThrow('not corroborated');
    expect(editorial.assessWithPackage).not.toHaveBeenCalled();
    expect(queue.updateStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['single_source'],
    ['insufficient'],
    ['conflicting'],
  ])('rejects a %s queue item before it can invoke the evaluator', async (verificationStatus) => {
    (evaluateResearchVerification as jest.Mock).mockReturnValue({ verificationStatus, canProceedAutomatically: false });

    await expect(service.generate('queue-1')).rejects.toThrow('not corroborated');
    expect(editorial.assessWithPackage).not.toHaveBeenCalled();
  });

  it.each([
    ['missing package', undefined],
    ['non-ready package', { ...researchPackage, status: 'building' }],
  ])('rejects a %s before it can invoke the evaluator', async (_label, resolvedPackage) => {
    packages.findById.mockResolvedValue(resolvedPackage);

    await expect(service.generate('queue-1')).rejects.toThrow('not eligible');
    expect(editorial.assessWithPackage).not.toHaveBeenCalled();
  });

  it('requires candidate-safe membership and the exact package snapshot', async () => {
    candidates.membershipCountsByOpportunityIds.mockResolvedValue(new Map([['opportunity-1', 0]]));
    await expect(service.generate('queue-1')).rejects.toThrow('not eligible');
    expect(editorial.assessWithPackage).not.toHaveBeenCalled();

    candidates.membershipCountsByOpportunityIds.mockResolvedValue(new Map([['opportunity-1', 1]]));
    packages.findById.mockResolvedValue({ ...researchPackage, opportunityId: 'another-opportunity' });
    await expect(service.generate('queue-1')).rejects.toThrow('not eligible');
    expect(editorial.assessWithPackage).not.toHaveBeenCalled();
  });

  it('marks only the failed queue item as failed when assessment persistence or evaluation fails', async () => {
    editorial.assessWithPackage.mockRejectedValue(new Error('provider failure'));

    await expect(service.generate('queue-1')).rejects.toThrow('provider failure');
    expect(queue.updateStatus).toHaveBeenNthCalledWith(1, 'queue-1', ProductionQueueStatus.PROCESSING);
    expect(queue.updateStatus).toHaveBeenNthCalledWith(2, 'queue-1', ProductionQueueStatus.FAILED);
    expect(bridge.synchronize).toHaveBeenCalledTimes(2);
  });

  it('preserves generation outcomes when pipeline observation fails', async () => {
    bridge.synchronize.mockRejectedValue(new Error('bridge unavailable'));
    await expect(service.generate('queue-1')).resolves.toMatchObject({ id: 'assessment-1' });
    expect(queue.updateStatus).toHaveBeenCalledWith('queue-1', ProductionQueueStatus.PROCESSING);
  });

  it('does not allow a project mismatch to generate an angle for another project', async () => {
    opportunities.findById.mockResolvedValue({ ...opportunity, projectId: 'project-2' });

    await expect(service.generate('queue-1')).rejects.toThrow('context is unavailable');
    expect(editorial.assessWithPackage).not.toHaveBeenCalled();
  });

  it('uses the queue package facts only, preventing sibling-package evidence from entering the angle input', async () => {
    packages.findFactsWithEvidenceByPackageIds.mockResolvedValue(new Map([
      ['package-1', [{ ...rows[0], normalizedClaimKey: 'queued-candidate' }]],
      ['newer-package', [{ ...rows[0], id: 'sibling-fact', normalizedClaimKey: 'sibling-candidate' }]],
    ]));

    await service.generate('queue-1');

    expect(packages.findFactsWithEvidenceByPackageIds).toHaveBeenCalledWith(['package-1']);
    expect(editorial.assessWithPackage).toHaveBeenCalledWith(opportunity, 'package-1');
  });

  it('leaves idempotent cache and stale-input decisions to the existing Editorial Assessment service', async () => {
    editorial.assessWithPackage.mockResolvedValue({ id: 'assessment-1', status: 'ready', inputHash: 'cached' });

    await service.generate('queue-1');
    await service.generate('queue-1');

    expect(editorial.assessWithPackage).toHaveBeenCalledTimes(2);
    expect(queue.updateStatus).not.toHaveBeenCalledWith('queue-1', ProductionQueueStatus.FAILED);
  });

  it('reads an existing angle for a terminal queue item without attempting generation', async () => {
    queue.findById.mockResolvedValue({ ...item, status: 'completed' });
    editorial.findOneWithPackage.mockResolvedValue({ id: 'assessment-1', status: 'ready' });

    await expect(service.find('queue-1')).resolves.toMatchObject({ id: 'assessment-1' });
    expect(editorial.findOneWithPackage).toHaveBeenCalledWith(opportunity, 'package-1');
    expect(editorial.assessWithPackage).not.toHaveBeenCalled();
  });
});
