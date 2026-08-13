jest.mock('@content-os/storage', () => ({ ContentScriptRepository: class {}, ScenePlanRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  AiTask: { SCENE_PLANNING: 'scene_planning' }, AiExecutionMode: { SYNCHRONOUS: 'synchronous' },
  ScenePlanStatus: { READY: 'ready', FAILED: 'failed' },
  SceneType: { B_ROLL: 'b_roll', MAP: 'map' },
  SceneMediaStrategy: { STOCK_OR_SOURCE_FOOTAGE: 'stock_or_source_footage', AI_IMAGE: 'ai_image' },
}));
jest.mock('../ai/ai-runtime.service', () => ({ AiRuntime: class {} }));

import { ConflictException } from '@nestjs/common';
import { ScenePlanningService, segmentNarration } from './scene-planning.service';

describe('ScenePlanningService', () => {
  const script = { id: 'script-1', projectId: 'project-1', status: 'ready', inputHash: 'script-input-v1', language: 'Hinglish', fullScript: 'India aur France FCAS programme par baat kar rahe hain aur is development ko analysts closely dekh rahe hain. Is partnership ka regional security aur future fighter technology par meaningful asar ho sakta hai.', citedFactIds: ['fact-1'] };
  const scripts = { findById: jest.fn() };
  const plans = { findByContentScriptId: jest.fn(), upsert: jest.fn() };
  const runtime = { route: jest.fn(), structuredGeneration: jest.fn() };
  const service = () => new ScenePlanningService(scripts as never, plans as never, runtime as never);
  const validOutput = () => {
    const segments = segmentNarration(script.fullScript, script.id);
    return { scenes: segments.map((segment, index) => ({ id: segment.id, index, narration: segment.narration, subtitleText: segment.narration, sceneType: 'b_roll', mediaStrategy: 'stock_or_source_footage', visualDescription: 'A grounded visual treatment.', primarySearchQuery: null, alternateSearchQueries: [], generatedMediaPrompt: null, onScreenText: null, citedFactIds: ['fact-1'], transitionRecommendation: 'cut', continuityNotes: null, manualReview: false, manualReviewReason: null })) };
  };

  beforeEach(() => {
    jest.resetAllMocks();
    scripts.findById.mockResolvedValue(script);
    plans.findByContentScriptId.mockResolvedValue(undefined);
    plans.upsert.mockImplementation(async (plan: object, scenes: object[]) => ({ id: 'plan-1', ...plan, scenes }));
    runtime.route.mockReturnValue({ provider: 'openai-cloud', model: 'gpt-test' });
    runtime.structuredGeneration.mockResolvedValue(validOutput());
  });

  it.each([
    ['English', 'This is one complete English sentence. This is another sentence.'],
    ['Hindi', 'भारत और फ्रांस साथ काम कर रहे हैं। यह महत्वपूर्ण है।'],
    ['Hinglish', 'India aur France milkar kaam kar rahe hain. Yeh important hai!'],
  ])('segments %s narration deterministically without dropped text', (_language, narration) => {
    const first = segmentNarration(narration, 'script-x');
    const second = segmentNarration(narration, 'script-x');
    expect(first).toEqual(second);
    expect(first.map((scene) => scene.narration).join(' ').replace(/\s+/g, ' ').trim()).toBe(narration.replace(/\s+/g, ' ').trim());
    expect(first.every((scene) => scene.estimatedDurationMs >= 1200 && scene.endEstimateMs > scene.startEstimateMs)).toBe(true);
  });

  it('groups dependent short sentences and splits long narration without duplicating punctuation', () => {
    const grouped = segmentNarration('This is the main statement. Why? Now explain it.');
    expect(grouped[0].narration).toContain('Why?');
    const long = Array.from({ length: 70 }, (_, index) => `word${index}`).join(' ');
    const segments = segmentNarration(long);
    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.narration).join(' ')).toBe(long);
  });

  it('uses exactly one shared AI Runtime request for the complete Content Package', async () => {
    await service().generate(script.id);
    expect(runtime.structuredGeneration).toHaveBeenCalledTimes(1);
    expect(runtime.structuredGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: 'scene_planning', projectId: script.projectId }));
    expect(plans.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', executionMode: 'synchronous' }), expect.any(Array));
  });

  it('reuses a compatible ready plan without calling the runtime', async () => {
    const result = await service().generate(script.id);
    plans.findByContentScriptId.mockResolvedValue(result);
    await expect(service().generate(script.id)).resolves.toEqual(result);
    expect(runtime.structuredGeneration).toHaveBeenCalledTimes(1);
  });

  it('regenerates stale script revisions rather than reusing a plan', async () => {
    const previous = await service().generate(script.id);
    plans.findByContentScriptId.mockResolvedValue({ ...previous, inputHash: 'stale' });
    await service().generate(script.id);
    expect(runtime.structuredGeneration).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['rewritten narration', (output: ReturnType<typeof validOutput>) => { output.scenes[0].narration = 'rewritten'; }],
    ['missing scene', (output: ReturnType<typeof validOutput>) => { output.scenes.pop(); }],
    ['duplicate scene id', (output: ReturnType<typeof validOutput>) => { output.scenes[1].id = output.scenes[0].id; }],
    ['reordered scene', (output: ReturnType<typeof validOutput>) => { output.scenes.reverse(); }],
    ['invalid enum', (output: ReturnType<typeof validOutput>) => { output.scenes[0].sceneType = 'unsupported'; }],
    ['unknown citation', (output: ReturnType<typeof validOutput>) => { output.scenes[0].citedFactIds = ['invented']; }],
  ])('rejects %s atomically and persists only a failed plan', async (_label, change) => {
    const output = validOutput(); change(output);
    runtime.structuredGeneration.mockResolvedValue(output);
    await expect(service().generate(script.id)).rejects.toBeInstanceOf(ConflictException);
    expect(plans.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', failureCode: 'generation_failed' }), []);
  });

  it('sanitizes provider failure and permits a later retry', async () => {
    runtime.structuredGeneration.mockRejectedValueOnce(new Error('provider secret payload')).mockResolvedValueOnce(validOutput());
    await expect(service().generate(script.id)).rejects.toThrow('Scene Plan generation failed');
    await expect(service().generate(script.id)).resolves.toEqual(expect.objectContaining({ status: 'ready' }));
    expect(runtime.structuredGeneration).toHaveBeenCalledTimes(2);
  });

  it('rejects non-ready packages before any provider call', async () => {
    scripts.findById.mockResolvedValue({ ...script, status: 'failed' });
    await expect(service().generate(script.id)).rejects.toThrow('not ready');
    expect(runtime.structuredGeneration).not.toHaveBeenCalled();
  });

  it('does not expose cross-project plans through a mismatched script', async () => {
    plans.findByContentScriptId.mockResolvedValue({ projectId: 'project-other' });
    await expect(service().find(script.id)).rejects.toThrow('not found');
  });
});
