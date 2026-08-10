jest.mock('@content-os/contracts', () => ({
  OPPORTUNITY_METRICS_V2_VERSION: 'opportunity-metrics-v2',
  EditorialAssessmentStatus: { READY: 'ready', FAILED: 'failed', STALE: 'stale' },
  EditorialAssessmentBand: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' },
  EditorialAssessmentLongevity: { BREAKING: 'breaking', TIMELY: 'timely', EVERGREEN: 'evergreen' },
  EditorialAssessmentRecommendation: { REJECT: 'reject', HOLD: 'hold', CONSIDER: 'consider', STRONG_CANDIDATE: 'strong_candidate' },
  ContentAngleType: { BREAKING: 'breaking', EXPLAINER: 'explainer', FACT_CHECK: 'fact_check', ANALYSIS: 'analysis', UPDATE: 'update' },
}));
jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  OpportunityMetricRepository: class OpportunityMetricRepository {},
  ProjectEditorialProfileRepository: class ProjectEditorialProfileRepository {},
  ResearchPackageRepository: class ResearchPackageRepository {},
  EditorialAssessmentRepository: class EditorialAssessmentRepository {},
}));

import { ConflictException, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { editorialAssessmentInputHash, EditorialAssessmentService } from './editorial-assessment.service';
import { EditorialEvaluatorNotConfiguredError } from './editorial-assessment.evaluator';

const opportunity = { id: 'opportunity-1', projectId: 'project-1', title: 'Story', summary: null, representativeUrl: 'https://example.com', status: 'detected' };
const profile = { projectId: 'project-1', mission: '', targetAudience: '', primaryLanguage: '', primaryGeography: '', topicThemes: [], excludedTopics: [], contentGoals: [], preferredFormats: [], timelinessPreference: 'balanced', revision: 1, createdAt: 'x', updatedAt: 'x' };
const metric = { opportunityId: 'opportunity-1', scoreVersion: 'opportunity-metrics-v2', opportunityScore: 30, freshnessScore: 30, supportScore: 0, sourceDiversityScore: 0, confirmationScore: 0, momentumScore: 0, persistenceScore: 0, signalCount: 1, independentSourceCount: 1, sourceTypeCount: 1, firstSeenAt: 'x', lastSeenAt: 'x', calculatedAt: 'x', inputHash: 'metric' };
const researchPackage = { id: 'package-1', status: 'ready', updatedAt: 'x', summary: 'summary', confidenceScore: 60, sourceCount: 1, signalCount: 1 };
const evaluation = { relevance: 'high', newsworthiness: 'high', contentPotential: 'high', longevity: 'evergreen', duplicationRisk: 'low', recommendation: 'strong_candidate', angleType: 'explainer', videoIdeaTitle: 'What the evidence means', videoIdeaSummary: 'A concise evidence-led video idea.', hook: 'Here is what the evidence actually shows.', whyNow: 'The topic is timely for this project.', rationale: 'Clear project fit.', citedFactIds: ['fact-1'], citedSignalIds: ['signal-1'] };

describe('EditorialAssessmentService', () => {
  const opportunities = { findById: jest.fn() };
  const metrics = { findByOpportunityId: jest.fn() };
  const profiles = { getOrCreateDefault: jest.fn() };
  const packages = { findByOpportunityId: jest.fn(), findFactsWithEvidenceByPackageIds: jest.fn() };
  const assessments = { find: jest.fn(), upsert: jest.fn() };
  const evaluator = { provider: 'fake', model: 'fake-v1', assess: jest.fn() };
  const service = new EditorialAssessmentService(opportunities as never, metrics as never, profiles as never, packages as never, assessments as never, evaluator as never);
  let currentProfile: typeof profile;
  let currentMetric: typeof metric;
  let currentPackage: typeof researchPackage;
  let stored: Record<string, unknown> | undefined;

  beforeEach(() => {
    jest.resetAllMocks();
    currentProfile = { ...profile };
    currentMetric = { ...metric };
    currentPackage = { ...researchPackage };
    stored = undefined;
    opportunities.findById.mockImplementation(async () => opportunity);
    profiles.getOrCreateDefault.mockImplementation(async () => currentProfile);
    metrics.findByOpportunityId.mockImplementation(async () => currentMetric);
    packages.findByOpportunityId.mockImplementation(async () => currentPackage);
    packages.findFactsWithEvidenceByPackageIds.mockResolvedValue(new Map([['package-1', [{ id: 'fact-1', claim: 'Claim', status: 'supported', signalId: 'signal-1', signalTitle: 'Signal', sourceName: 'Source' }]]]));
    assessments.find.mockImplementation(async () => stored);
    assessments.upsert.mockImplementation(async (value: Record<string, unknown>) => {
      stored = { id: 'assessment-1', ...value, createdAt: 'x', updatedAt: 'x' };
      return stored;
    });
    evaluator.assess.mockResolvedValue(evaluation);
  });

  it('rejects missing opportunity, metrics, and a non-ready research package without evaluating', async () => {
    opportunities.findById.mockResolvedValueOnce(undefined);
    await expect(service.assess('id')).rejects.toBeInstanceOf(NotFoundException);
    metrics.findByOpportunityId.mockResolvedValueOnce(undefined);
    await expect(service.assess('id')).rejects.toBeInstanceOf(ConflictException);
    packages.findByOpportunityId.mockResolvedValueOnce({ ...currentPackage, status: 'pending' });
    await expect(service.assess('id')).rejects.toBeInstanceOf(ConflictException);
    expect(evaluator.assess).not.toHaveBeenCalled();
  });

  it('reuses an identical ready assessment without calling the evaluator again', async () => {
    const first = await service.assess('opportunity-1');
    const second = await service.assess('opportunity-1');
    expect(second).toEqual(first);
    expect(evaluator.assess).toHaveBeenCalledTimes(1);
    expect(assessments.upsert).toHaveBeenCalledTimes(1);
  });

  it('changes the deterministic cache key for the new prompt version while retaining same-version reuse', async () => {
    const sharedInput = { project: 'project-1', opportunity: 'opportunity-1', evidence: ['fact-1'] };
    const v1Hash = editorialAssessmentInputHash({ ...sharedInput, promptVersion: 'editorial-assessment-v1' });
    const contentAngleHash = editorialAssessmentInputHash({ ...sharedInput, promptVersion: 'content-angle-v1' });
    expect(contentAngleHash).not.toBe(v1Hash);

    const first = await service.assess('opportunity-1');
    expect(first.promptVersion).toBe('content-angle-v1');
    const second = await service.assess('opportunity-1');
    expect(second).toEqual(first);
    expect(evaluator.assess).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['profile revision', () => { currentProfile = { ...currentProfile, revision: 2, mission: 'Changed mission' }; }],
    ['research package material', () => { currentPackage = { ...currentPackage, updatedAt: 'y', summary: 'Updated summary' }; }],
    ['metrics V2 material', () => { currentMetric = { ...currentMetric, opportunityScore: 31, inputHash: 'metric-2' }; }],
  ])('reassesses and upserts the same current row when %s changes', async (_name, change) => {
    await service.assess('opportunity-1');
    const firstHash = stored?.inputHash;
    change();
    await service.assess('opportunity-1');
    expect(stored?.id).toBe('assessment-1');
    expect(stored?.inputHash).not.toBe(firstHash);
    expect(evaluator.assess).toHaveBeenCalledTimes(2);
    expect(assessments.upsert).toHaveBeenCalledTimes(2);
    expect(assessments.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ projectId: 'project-1', opportunityId: 'opportunity-1' }));
    expect(assessments.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ projectId: 'project-1', opportunityId: 'opportunity-1' }));
  });

  it('derives stale on read without reevaluating or writing over the prior result', async () => {
    const ready = await service.assess('opportunity-1');
    currentProfile = { ...currentProfile, revision: 2, mission: 'Changed mission' };
    const stale = await service.findOne('opportunity-1');
    expect(stale).toMatchObject({ status: 'stale', rationale: ready.rationale, editorialScore: ready.editorialScore });
    expect(evaluator.assess).toHaveBeenCalledTimes(1);
    expect(assessments.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not mutate Research Confidence or Opportunity Metrics V2 during assessment', async () => {
    const metricBefore = JSON.stringify(currentMetric);
    const packageBefore = JSON.stringify(currentPackage);
    await service.assess('opportunity-1');
    expect(JSON.stringify(currentMetric)).toBe(metricBefore);
    expect(JSON.stringify(currentPackage)).toBe(packageBefore);
  });

  it('rejects invented citations and records a controlled evaluator failure', async () => {
    evaluator.assess.mockResolvedValueOnce({ ...evaluation, citedFactIds: ['invented'] });
    await expect(service.assess('opportunity-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(assessments.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', errorCode: 'provider_failure' }));
  });

  it.each([
    ['an invalid recommendation', { ...evaluation, recommendation: 'unsupported' }, 'invalid_recommendation', 'recommendation'],
    ['an invalid longevity value', { ...evaluation, longevity: 'low' }, 'invalid_longevity', 'longevity'],
    ['an invalid angle type', { ...evaluation, angleType: 'viral' }, 'invalid_angle_type', 'angleType'],
    ['a missing video idea title', { ...evaluation, videoIdeaTitle: '' }, 'missing_video_idea_title', 'videoIdeaTitle'],
    ['an oversized video idea title', { ...evaluation, videoIdeaTitle: 'x'.repeat(141) }, 'video_idea_title_too_long', 'videoIdeaTitle'],
    ['a missing video idea summary', { ...evaluation, videoIdeaSummary: '' }, 'missing_video_idea_summary', 'videoIdeaSummary'],
    ['an oversized video idea summary', { ...evaluation, videoIdeaSummary: 'x'.repeat(601) }, 'video_idea_summary_too_long', 'videoIdeaSummary'],
    ['an oversized hook', { ...evaluation, hook: 'x'.repeat(241) }, 'hook_too_long', 'hook'],
    ['an oversized why now', { ...evaluation, whyNow: 'x'.repeat(361) }, 'why_now_too_long', 'whyNow'],
    ['an invented fact citation', { ...evaluation, citedFactIds: ['invented-fact'] }, 'unknown_fact_citation', 'citedFactIds'],
    ['an invented signal citation', { ...evaluation, citedSignalIds: ['invented-signal'] }, 'unknown_signal_citation', 'citedSignalIds'],
    ['an oversized rationale', { ...evaluation, rationale: 'x'.repeat(501) }, 'rationale_too_long', 'rationale'],
  ])('logs a safe output-validation diagnostic for %s while retaining the sanitized client error', async (_name, output, reasonCode, field) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    currentProfile = { ...currentProfile, mission: 'private-profile-content' };
    currentPackage = { ...currentPackage, summary: 'private-package-content' };
    evaluator.assess.mockResolvedValueOnce(output);

    await expect(service.assess('opportunity-1')).rejects.toMatchObject({ message: 'Editorial evaluator request failed' });

    const logs = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logs).toContain('editorial_assessment.output_validation_failed');
    expect(logs).toContain(reasonCode);
    expect(logs).toContain(field);
    expect(logs).not.toContain('private-profile-content');
    expect(logs).not.toContain('private-package-content');
    warn.mockRestore();
  });

  it('returns a controlled not-configured failure without a startup dependency', async () => {
    evaluator.assess.mockRejectedValueOnce(new EditorialEvaluatorNotConfiguredError());
    await expect(service.assess('opportunity-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(assessments.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ errorCode: 'not_configured' }));
  });

  it('returns a controlled error when persistence fails and never returns a false success', async () => {
    assessments.upsert.mockRejectedValue(new Error('sqlite write failed'));
    await expect(service.assess('opportunity-1')).rejects.toMatchObject({
      message: 'Unable to persist editorial assessment',
    });
  });

  it('treats a ready assessment without the Content Angle fields as stale', async () => {
    await service.assess('opportunity-1');
    stored = { ...stored, angleType: null, videoIdeaTitle: null, videoIdeaSummary: null, hook: null, whyNow: null };

    await expect(service.findOne('opportunity-1')).resolves.toMatchObject({ status: 'stale' });
    expect(evaluator.assess).toHaveBeenCalledTimes(1);
    expect(assessments.upsert).toHaveBeenCalledTimes(1);
  });

  it('keeps Idea Score server-derived instead of trusting a provider score', async () => {
    evaluator.assess.mockResolvedValueOnce({ ...evaluation, editorialScore: 0 });

    await expect(service.assess('opportunity-1')).resolves.toMatchObject({
      editorialScore: 100,
    });
  });
});
