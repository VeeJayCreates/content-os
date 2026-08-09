import { validate } from 'class-validator';
import { NotFoundException } from '@nestjs/common';

jest.mock('@content-os/storage', () => ({ ProjectRepository: class ProjectRepository {}, TopicSelectionRepository: class TopicSelectionRepository {}, defaultProjectSelectionPolicy: { minimumOpportunityScore: 60, minimumResearchConfidence: 60, minimumIndependentSources: 2, maxSelectedPerRun: 3, requireResearchPackage: true, allowSingleSourceBreakingStories: false } }));

import { UpdateSelectionPolicyDto } from './dto/update-selection-policy.dto';
import { SelectionPolicyService } from './selection-policy.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const defaults = { projectId, minimumOpportunityScore: 60, minimumResearchConfidence: 60, minimumIndependentSources: 2, maxSelectedPerRun: 3, requireResearchPackage: true, allowSingleSourceBreakingStories: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' };

describe('SelectionPolicyService', () => {
  const projects = { findById: jest.fn() };
  const policies = { findPolicy: jest.fn(), upsertPolicy: jest.fn() };
  const service = new SelectionPolicyService(projects as never, policies as never);
  beforeEach(() => jest.resetAllMocks());

  it('creates and returns defaults once for an existing project', async () => { projects.findById.mockResolvedValue({ id: projectId }); policies.findPolicy.mockResolvedValue(undefined); policies.upsertPolicy.mockResolvedValue(defaults); await expect(service.get(projectId)).resolves.toEqual(defaults); expect(policies.upsertPolicy).toHaveBeenCalledTimes(1); });
  it('updates persisted fields without creating another policy', async () => { const updated = { ...defaults, minimumOpportunityScore: 75, maxSelectedPerRun: 2 }; projects.findById.mockResolvedValue({ id: projectId }); policies.findPolicy.mockResolvedValue(defaults); policies.upsertPolicy.mockResolvedValue(updated); await expect(service.update(projectId, { minimumOpportunityScore: 75, maxSelectedPerRun: 2 })).resolves.toEqual(updated); expect(policies.upsertPolicy).toHaveBeenCalledWith(projectId, expect.objectContaining({ minimumOpportunityScore: 75, maxSelectedPerRun: 2 })); });
  it('rejects invalid numeric and boolean DTO values', async () => { for (const value of [-1, 101]) { expect(await validate(Object.assign(new UpdateSelectionPolicyDto(), { minimumOpportunityScore: value }))).not.toHaveLength(0); expect(await validate(Object.assign(new UpdateSelectionPolicyDto(), { minimumResearchConfidence: value }))).not.toHaveLength(0); } expect(await validate(Object.assign(new UpdateSelectionPolicyDto(), { minimumIndependentSources: 0 }))).not.toHaveLength(0); expect(await validate(Object.assign(new UpdateSelectionPolicyDto(), { maxSelectedPerRun: 0 }))).not.toHaveLength(0); expect(await validate(Object.assign(new UpdateSelectionPolicyDto(), { requireResearchPackage: 'yes' }))).not.toHaveLength(0); });
  it('returns 404 for a missing project on get and update', async () => { projects.findById.mockResolvedValue(undefined); await expect(service.get(projectId)).rejects.toBeInstanceOf(NotFoundException); await expect(service.update(projectId, {})).rejects.toBeInstanceOf(NotFoundException); });
});
