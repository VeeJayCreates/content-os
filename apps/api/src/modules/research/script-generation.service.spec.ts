jest.mock('@content-os/storage', () => ({ ContentScriptRepository: class {}, EditorialAssessmentRepository: class {}, ProductionQueueRepository: class {}, ResearchPackageRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  AiTask: { SCRIPT_GENERATION: 'script_generation' },
  AiExecutionMode: { SYNCHRONOUS: 'synchronous', BATCH: 'batch' },
  ProductionQueueStatus: { FAILED: 'failed' },
  ScriptFormat: { YOUTUBE_SHORT: 'youtube_short', YOUTUBE_LONG: 'youtube_long' },
  ScriptLanguage: { HINDI: 'Hindi', HINGLISH: 'Hinglish', ENGLISH: 'English' },
  ScriptStatus: { READY: 'ready' },
}));
jest.mock('../ai/ai-runtime.service', () => ({ AiRuntime: class {} }));

import { ScriptFormat, ScriptLanguage } from '@content-os/contracts';
import { ScriptGenerationService } from './script-generation.service';

describe('ScriptGenerationService', () => {
  const queue = { updateStatus: jest.fn() };
  const angles = { resolveEligibleContext: jest.fn() };
  const packages = { findFactsWithEvidenceByPackageIds: jest.fn() };
  const assessments = { find: jest.fn() };
  const scripts = { findByQueueItemId: jest.fn(), upsert: jest.fn() };
  const runtime = { structuredGeneration: jest.fn(), route: jest.fn() };
  const service = () => new ScriptGenerationService(queue as never, angles as never, packages as never, assessments as never, scripts as never, runtime as never);
  const context = { item: { id: 'queue-1', researchPackageId: 'package-1' }, opportunity: { id: 'opportunity-1', projectId: 'project-1' } };
  const angle = { id: 'angle-1', status: 'ready', researchPackageId: 'package-1', angleType: 'explainer', videoIdeaTitle: 'FCAS explained', videoIdeaSummary: 'summary', hook: 'why now', whyNow: 'now' };
  const facts = [{ id: 'fact-1', claim: 'Verified FCAS fact', status: 'supported', signalId: 'signal-1' }];
  const output = { hook: 'Why this matters', body: 'The verified body narration.', closing: 'Follow for more.', fullScript: 'Why this matters. The verified body narration. Follow for more.', citedFactIds: ['fact-1'] };

  beforeEach(() => {
    jest.resetAllMocks();
    angles.resolveEligibleContext.mockResolvedValue(context);
    assessments.find.mockResolvedValue(angle);
    packages.findFactsWithEvidenceByPackageIds.mockResolvedValue(new Map([['package-1', facts]]));
    scripts.findByQueueItemId.mockResolvedValue(undefined);
    scripts.upsert.mockImplementation(async (value: object) => ({ id: 'script-1', ...value }));
    runtime.structuredGeneration.mockResolvedValue(output);
    runtime.route.mockReturnValue({ provider: 'openai-cloud', model: 'gpt-test' });
  });

  it('generates an eligible corroborated queue item via SCRIPT_GENERATION and persists through the shared path', async () => {
    const generated = await service().generate('queue-1');
    expect(runtime.structuredGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: 'script_generation', projectId: 'project-1' }));
    expect(generated).toEqual(expect.objectContaining({ researchPackageId: 'package-1', status: 'ready', executionMode: 'synchronous' }));
    expect(queue.updateStatus).not.toHaveBeenCalled();
  });

  it.each(['single_source', 'insufficient', 'conflicting'])('rejects %s eligibility before calling the runtime', async (reason) => {
    angles.resolveEligibleContext.mockRejectedValue(new Error(`Queue item research is ${reason}`));
    await expect(service().generate('queue-1')).rejects.toThrow(reason);
    expect(runtime.structuredGeneration).not.toHaveBeenCalled();
  });

  it.each([
    ['missing angle', undefined],
    ['non-ready angle', { ...angle, status: 'failed' }],
    ['newer angle package', { ...angle, researchPackageId: 'newer-package' }],
  ])('rejects %s and never uses another package', async (_label, assessment) => {
    assessments.find.mockResolvedValue(assessment);
    await expect(service().generate('queue-1')).rejects.toThrow('grounded Content Angle');
    expect(packages.findFactsWithEvidenceByPackageIds).not.toHaveBeenCalled();
  });

  it.each([
    ['missing facts', []],
    ['sibling package facts only', undefined],
  ])('requires candidate-safe facts from the exact queued package: %s', async (_label, rows) => {
    packages.findFactsWithEvidenceByPackageIds.mockResolvedValue(new Map(rows === undefined ? [['newer-package', facts]] : [['package-1', rows]]));
    await expect(service().generate('queue-1')).rejects.toThrow('Candidate-safe');
    expect(packages.findFactsWithEvidenceByPackageIds).toHaveBeenCalledWith(['package-1']);
  });

  it.each([
    ['unknown fact', { ...output, citedFactIds: ['invented'] }, 'unsupported facts'],
    ['other-package fact', { ...output, citedFactIds: ['fact-other'] }, 'unsupported facts'],
    ['malformed output', null, 'output is invalid'],
    ['missing narration', { ...output, body: '' }, 'output is invalid'],
    ['short weak hook', { ...output, hook: 'short' }, 'strong hook'],
  ])('rejects %s output', async (_label, result, message) => {
    runtime.structuredGeneration.mockResolvedValue(result);
    await expect(service().generate('queue-1')).rejects.toThrow(message);
    expect(queue.updateStatus).toHaveBeenCalledWith('queue-1', 'failed');
  });

  it.each([
    [ScriptFormat.YOUTUBE_SHORT, undefined, ScriptLanguage.ENGLISH, 60, 135],
    [ScriptFormat.YOUTUBE_LONG, undefined, ScriptLanguage.HINDI, 480, 1080],
    [ScriptFormat.YOUTUBE_LONG, 900, ScriptLanguage.HINGLISH, 900, 2025],
  ])('derives deterministic format, duration, word count and language', async (format, duration, language, expectedDuration, words) => {
    await service().generate('queue-1', { format, language, targetDurationSeconds: duration });
    expect(runtime.structuredGeneration.mock.calls[0][0].input).toEqual(expect.objectContaining({ format, language, targetDurationSeconds: expectedDuration, targetWordCount: words }));
  });

  it.each([59, 3601, 60.5])('rejects invalid long-form duration %s', async (duration) => {
    await expect(service().generate('queue-1', { format: ScriptFormat.YOUTUBE_LONG, targetDurationSeconds: duration })).rejects.toThrow('between 60 and 3600');
  });

  it('reuses an unchanged ready Script without an AI call', async () => {
    const prepared = await service().prepare('queue-1');
    scripts.findByQueueItemId.mockResolvedValue({ id: 'script-1', status: 'ready', inputHash: prepared.inputHash });
    await expect(service().generate('queue-1')).resolves.toEqual(expect.objectContaining({ id: 'script-1' }));
    expect(runtime.structuredGeneration).not.toHaveBeenCalled();
  });

  it.each([
    ['Content Angle', () => assessments.find.mockResolvedValue({ ...angle, videoIdeaTitle: 'New angle' })],
    ['Research Package facts', () => packages.findFactsWithEvidenceByPackageIds.mockResolvedValue(new Map([['package-1', [{ ...facts[0], claim: 'Changed fact' }]]]))],
  ])('changes the input hash when %s materially changes', async (_label, change) => {
    const before = await service().prepare('queue-1');
    change();
    const after = await service().prepare('queue-1');
    expect(after.inputHash).not.toBe(before.inputHash);
  });

  it.each([
    [{ format: ScriptFormat.YOUTUBE_LONG }, { format: ScriptFormat.YOUTUBE_SHORT }],
    [{ language: ScriptLanguage.HINDI }, { language: ScriptLanguage.ENGLISH }],
    [{ format: ScriptFormat.YOUTUBE_LONG, targetDurationSeconds: 600 }, { format: ScriptFormat.YOUTUBE_LONG, targetDurationSeconds: 900 }],
  ])('changes the hash when relevant generation configuration changes', async (first, second) => {
    expect((await service().prepare('queue-1', first)).inputHash).not.toBe((await service().prepare('queue-1', second)).inputHash);
  });

  it('marks only the synchronous queue item failed on provider failure and has no embedding or rerank dependency', async () => {
    runtime.structuredGeneration.mockRejectedValue(new Error('provider unavailable'));
    await expect(service().generate('queue-1')).rejects.toThrow('provider unavailable');
    expect(queue.updateStatus).toHaveBeenCalledWith('queue-1', 'failed');
    expect(runtime).not.toHaveProperty('embed');
    expect(runtime).not.toHaveProperty('rerank');
  });
});
