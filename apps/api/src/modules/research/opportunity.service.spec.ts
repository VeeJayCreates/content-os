import { validate } from 'class-validator';

jest.mock('@content-os/contracts', () => ({
  OpportunityStatus: {
    DETECTED: 'detected',
    SHORTLISTED: 'shortlisted',
    REJECTED: 'rejected',
    CONVERTED: 'converted',
  },
}));

jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  ProjectRepository: class ProjectRepository {},
}));

jest.mock('./opportunity-detection.service', () => ({
  OpportunityDetectionService: class OpportunityDetectionService {},
}));

const OpportunityStatus = {
  DETECTED: 'detected',
  SHORTLISTED: 'shortlisted',
} as const;

import { DetectOpportunitiesDto } from './dto/detect-opportunities.dto';
import { UpdateOpportunityStatusDto } from './dto/update-opportunity-status.dto';
import { OpportunityService } from './opportunity.service';

const opportunity = { id: 'opportunity-1', projectId: 'project-1', projectName: 'Project', clusterKey: 'url:https://example.com/', title: 'Title', representativeUrl: 'https://example.com/', summary: null, status: OpportunityStatus.DETECTED, score: 70, signalCount: 1, sourceCount: 1, firstSeenAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

describe('OpportunityService', () => {
  const repository = { findAll: jest.fn(), findById: jest.fn(), findSignalsByOpportunityIds: jest.fn(), update: jest.fn() };
  const detection = { detect: jest.fn() };
  const projects = { findById: jest.fn() };
  const service = new OpportunityService(repository as never, detection as never, projects as never);

  beforeEach(() => jest.resetAllMocks());

  it('rejects invalid project and status DTO values', async () => {
    expect(await validate(Object.assign(new DetectOpportunitiesDto(), { projectId: 'not-a-uuid' }))).not.toHaveLength(0);
    expect(await validate(Object.assign(new UpdateOpportunityStatusDto(), { status: 'invalid' }))).not.toHaveLength(0);
  });

  it('returns 404 when detecting for a missing project', async () => {
    projects.findById.mockResolvedValue(undefined);
    await expect(service.detect('11111111-1111-4111-8111-111111111111')).rejects.toThrow('Project not found');
  });

  it('returns 404 for a missing opportunity', async () => {
    repository.findById.mockResolvedValue(undefined);
    await expect(service.findOne('11111111-1111-4111-8111-111111111111')).rejects.toThrow('Opportunity not found');
  });

  it('persists a valid status update', async () => {
    repository.findById.mockResolvedValue(opportunity);
    repository.update.mockResolvedValue({ ...opportunity, status: OpportunityStatus.SHORTLISTED });
    await expect(service.updateStatus(opportunity.id, OpportunityStatus.SHORTLISTED)).resolves.toMatchObject({ status: OpportunityStatus.SHORTLISTED });
    expect(repository.update).toHaveBeenCalledWith(opportunity.id, { status: OpportunityStatus.SHORTLISTED });
  });

  it('returns the shared detection result shape', async () => {
    projects.findById.mockResolvedValue({ id: 'project-1' });
    detection.detect.mockResolvedValue({ signalsProcessed: 2, opportunitiesCreated: 1, opportunitiesUpdated: 0, linksCreated: 2, warnings: [] });
    await expect(service.detect('project-1')).resolves.toEqual({ signalsProcessed: 2, opportunitiesCreated: 1, opportunitiesUpdated: 0, linksCreated: 2, warnings: [] });
  });
});
