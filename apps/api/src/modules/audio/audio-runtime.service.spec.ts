jest.mock('@content-os/storage', () => ({ AudioGenerationRepository: class {}, ContentScriptRepository: class {}, ScenePlanRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  AudioGenerationStatus: { READY: 'ready', FAILED: 'failed' },
  AudioSegmentStatus: { READY: 'ready' },
  ScenePlanStatus: { READY: 'ready' },
  VoiceEmotion: { NEUTRAL: 'neutral', URGENT: 'urgent' },
  VoiceIntensity: { MEDIUM: 'medium', HIGH: 'high' },
  VoiceSpeakingRate: { NORMAL: 'normal', FAST: 'fast' },
  VoicePitchDirection: { NEUTRAL: 'neutral', HIGHER: 'higher' },
}));

import { AudioRuntimeService, normalizeVoiceDirection } from './audio-runtime.service';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testWav = () => { const data = Buffer.alloc(16, 1); const buffer = Buffer.alloc(44 + data.length); buffer.write('RIFF'); buffer.writeUInt32LE(36 + data.length, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(8_000, 24); buffer.writeUInt32LE(16_000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(data.length, 40); data.copy(buffer, 44); return buffer; };

describe('AudioRuntimeService', () => {
  const scripts = { findById: jest.fn() };
  const plans = { findByContentScriptId: jest.fn() };
  const generations = { findByContentScriptId: jest.fn(), upsert: jest.fn(), upsertFailurePreservingReady: jest.fn() };
  const provider = { id: 'test-local', configuration: jest.fn(() => ({ provider: 'test-local', model: 'test-model', modelVersion: '1.0.0', modelRevision: 'test-revision', protocolVersion: 'test-v1', voiceId: 'voice-1', outputDirectory: 'C:/audio', timeoutMs: 60_000, languageModes: { Hinglish: 'hinglish', Hindi: 'hi', English: 'en' }, capabilities: { emotion: true, intensity: true, speakingRate: true, pitchDirection: true, emphasisWords: true, pauses: true, nonVerbalEvents: true, pronunciationOverrides: true }, expressionTags: [], selectableVoiceIds: ['voice-1'], languageSupport: { production: ['Hindi', 'English'], previewOnly: ['Hinglish'] }, degradations: [] })), synthesize: jest.fn() };
  const configuration = provider.configuration();
  const service = () => new AudioRuntimeService(scripts as never, plans as never, generations as never, provider as never);
  const script = { id: 'script-1', projectId: 'project-1', fullScript: 'First sentence. Second sentence.', language: 'Hindi' };
  const scenePlan = { id: 'plan-1', projectId: 'project-1', contentScriptId: 'script-1', status: 'ready', inputHash: 'scene-input-1', scenes: [
    { id: 'scene-1', sceneIndex: 0, narration: 'First sentence.' },
    { id: 'scene-2', sceneIndex: 1, narration: 'Second sentence.' },
  ] };

  beforeEach(() => {
    jest.resetAllMocks();
    scripts.findById.mockResolvedValue(script);
    plans.findByContentScriptId.mockResolvedValue(scenePlan);
    generations.findByContentScriptId.mockResolvedValue(undefined);
    generations.upsert.mockImplementation(async (generation, segments) => ({ id: 'audio-1', ...generation, segments }));
    generations.upsertFailurePreservingReady.mockImplementation(async (generation) => ({ id: 'audio-1', ...generation, segments: [] }));
  });

  it('creates a deterministic hash and stable one-to-one scene ordering', async () => {
    const first = await service().prepare('script-1', configuration);
    const second = await service().prepare('script-1', configuration);
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.segments.map((segment) => [segment.sceneId, segment.sceneIndex])).toEqual([['scene-1', 0], ['scene-2', 1]]);
  });

  it('rejects narration that does not reconcile exactly', async () => {
    plans.findByContentScriptId.mockResolvedValue({ ...scenePlan, scenes: [{ ...scenePlan.scenes[0], narration: 'Changed narration.' }] });
    await expect(service().prepare('script-1', configuration)).rejects.toThrow('does not reconcile');
  });

  it('rejects preview-only Hinglish rather than silently producing automatic audio', async () => {
    scripts.findById.mockResolvedValue({ ...script, language: 'Hinglish' });
    await expect(service().prepare('script-1', configuration)).rejects.toThrow('does not support');
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('reuses a compatible ready generation and treats a scene revision as stale', async () => {
    const prepared = await service().prepare('script-1', configuration);
    generations.findByContentScriptId.mockResolvedValue({ status: 'ready', inputHash: prepared.inputHash, projectId: 'project-1', segments: [] });
    expect((await service().prepare('script-1', configuration)).cached).not.toBeNull();
    plans.findByContentScriptId.mockResolvedValue({ ...scenePlan, inputHash: 'scene-input-2' });
    expect((await service().prepare('script-1', configuration)).cached).toBeNull();
  });

  it('invalidates a cached generation when voice or provider render configuration changes', async () => {
    const prepared = await service().prepare('script-1', configuration);
    generations.findByContentScriptId.mockResolvedValue({ status: 'ready', inputHash: prepared.inputHash, projectId: 'project-1', segments: [] });
    expect((await service().prepare('script-1', configuration)).cached).not.toBeNull();
    expect((await service().prepare('script-1', { ...configuration, voiceId: 'voice-2' })).cached).toBeNull();
    expect((await service().prepare('script-1', { ...configuration, outputConfiguration: { sampleRate: 24_000 } })).cached).toBeNull();
  });

  it('degrades unsupported voice controls safely and marks manual review', () => {
    const direction = normalizeVoiceDirection({ emotion: 'urgent' as never, pitchDirection: 'higher' as never, emphasisWords: [' India ', 'India'], pauseAfterMs: 100 }, { emotion: false, intensity: false, speakingRate: false, pitchDirection: false, emphasisWords: false, pauses: false, nonVerbalEvents: false, pronunciationOverrides: false });
    expect(direction).toMatchObject({ emotion: 'neutral', pitchDirection: 'neutral', emphasisWords: [], pauseAfterMs: 0, manualReview: true });
  });

  it('persists ready audio atomically only when every segment has valid output', async () => {
    const prepared = await service().prepare('script-1', configuration);
    await expect(service().persistReady(prepared, [{ segmentId: prepared.segments[0].id, actualDurationMs: 1000, audioPath: 'a.wav' }])).rejects.toThrow('does not match');
    expect(generations.upsert).not.toHaveBeenCalled();
    await service().persistReady(prepared, prepared.segments.map((segment) => ({ segmentId: segment.id, actualDurationMs: 1000, audioPath: `${segment.sceneIndex}.wav` })));
    expect(generations.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', totalDurationMs: 2000 }), expect.arrayContaining([expect.objectContaining({ status: 'ready' })]));
  });

  it('persists failures with no ready segments and enforces project isolation on reads', async () => {
    const prepared = await service().prepare('script-1', configuration);
    await service().persistFailure(prepared, 'provider_error');
    expect(generations.upsertFailurePreservingReady).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', failureCode: 'provider_error' }));
    generations.findByContentScriptId.mockResolvedValue({ projectId: 'other-project' });
    await expect(service().find('script-1', 'project-1')).rejects.toThrow('not found');
  });

  it('generates segments sequentially and persists cumulative actual timing', async () => {
    const outputDirectory = join(tmpdir(), `content-os-audio-runtime-${Date.now()}`);
    provider.configuration.mockReturnValue({ ...configuration, outputDirectory });
    const executionOrder: number[] = [];
    provider.synthesize.mockImplementation(async ({ segment, outputPath }) => { executionOrder.push(segment.sceneIndex); await mkdir(outputDirectory, { recursive: true }); await writeFile(outputPath, testWav()); return { segmentId: segment.segmentId, actualDurationMs: 1000, audioPath: outputPath }; });
    const result = await service().generate('script-1');
    expect(executionOrder).toEqual([0, 1]);
    expect(result).toMatchObject({ status: 'ready', totalDurationMs: 2000 });
    expect(generations.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ready', totalDurationMs: 2000 }), expect.arrayContaining([expect.objectContaining({ startMs: 0, endMs: 1000 }), expect.objectContaining({ startMs: 1000, endMs: 2000 })]));
  });

  it('rejects duplicate in-flight work and leaves failed attempts without ready segments', async () => {
    const outputDirectory = join(tmpdir(), `content-os-audio-runtime-${Date.now()}`);
    provider.configuration.mockReturnValue({ ...configuration, outputDirectory });
    let rejectWorker: (() => void) | undefined;
    provider.synthesize.mockImplementation(() => new Promise((_resolve, reject) => { rejectWorker = () => reject(new Error('failed')); }));
    const current = service();
    const first = current.generate('script-1');
    await expect(current.generate('script-1')).rejects.toThrow('already in progress');
    while (!rejectWorker) await new Promise((resolve) => setImmediate(resolve));
    rejectWorker?.();
    await expect(first).rejects.toThrow('Audio generation failed');
    expect(generations.upsertFailurePreservingReady).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('allows a safe retry after a failed attempt', async () => {
    const outputDirectory = join(tmpdir(), `content-os-audio-runtime-${Date.now()}`);
    provider.configuration.mockReturnValue({ ...configuration, outputDirectory });
    provider.synthesize.mockRejectedValueOnce(new Error('failed'));
    await expect(service().generate('script-1')).rejects.toThrow('Audio generation failed');
    provider.synthesize.mockImplementation(async ({ segment, outputPath }) => { await mkdir(outputDirectory, { recursive: true }); await writeFile(outputPath, testWav()); return { segmentId: segment.segmentId, actualDurationMs: 1000, audioPath: outputPath }; });
    await expect(service().generate('script-1')).resolves.toMatchObject({ status: 'ready', totalDurationMs: 2000 });
  });

  it('streams only a ready segment that belongs to the current content-script generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-os-audio-segment-'));
    const outputPath = join(root, 'ready', 'segment.wav');
    const current = service();
    const prepared = await current.prepare('script-1', configuration);
    await mkdir(join(root, 'ready'), { recursive: true });
    await writeFile(outputPath, testWav());
    const generation = { id: 'audio-1', projectId: 'project-1', status: 'ready', inputHash: prepared.inputHash, segments: [{ id: 'segment-1', status: 'ready', audioPath: outputPath }] };
    provider.configuration.mockReturnValue({ ...configuration, outputDirectory: root });
    generations.findByContentScriptId.mockResolvedValue(generation);

    try {
      const streamed = await current.streamReadyAudioSegment('script-1', 'segment-1');
      const chunks: Buffer[] = [];
      for await (const chunk of streamed) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe('RIFF');
      await expect(current.streamReadyAudioSegment('script-1', 'other-generation-segment')).rejects.toThrow('not found');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects stale, failed, missing, and out-of-root segment media without using client paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-os-audio-segment-'));
    const externalRoot = await mkdtemp(join(tmpdir(), 'content-os-audio-external-'));
    const outputPath = join(root, 'ready', 'segment.wav');
    const externalPath = join(externalRoot, 'segment.wav');
    const current = service();
    const prepared = await current.prepare('script-1', configuration);
    await mkdir(join(root, 'ready'), { recursive: true });
    await writeFile(outputPath, testWav());
    await writeFile(externalPath, testWav());
    const generation = { id: 'audio-1', projectId: 'project-1', status: 'ready', inputHash: prepared.inputHash, segments: [{ id: 'segment-1', status: 'ready', audioPath: outputPath }] };
    provider.configuration.mockReturnValue({ ...configuration, outputDirectory: root });
    generations.findByContentScriptId.mockResolvedValue(generation);

    try {
      generation.inputHash = 'stale-input';
      await expect(current.streamReadyAudioSegment('script-1', 'segment-1')).rejects.toThrow('stale');
      generation.inputHash = prepared.inputHash;
      generation.status = 'failed';
      await expect(current.streamReadyAudioSegment('script-1', 'segment-1')).rejects.toThrow('Ready audio');
      generation.status = 'ready';
      generation.segments[0].audioPath = externalPath;
      await expect(current.streamReadyAudioSegment('script-1', 'segment-1')).rejects.toThrow('not found');
      generation.segments[0].audioPath = join(root, 'ready', 'missing.wav');
      await expect(current.streamReadyAudioSegment('script-1', 'segment-1')).rejects.toThrow('not found');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(externalRoot, { recursive: true, force: true });
    }
  });
});
