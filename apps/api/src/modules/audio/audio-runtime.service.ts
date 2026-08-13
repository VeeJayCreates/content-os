import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { ConflictException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import {
  AudioGenerationStatus,
  AudioSegmentStatus,
  ScenePlanStatus,
  type VoiceDirection,
} from '@content-os/contracts';
import { AudioGenerationRepository, ContentScriptRepository, ScenePlanRepository, type AudioSegmentWrite } from '@content-os/storage';
import type { AudioProvider, AudioProviderCapabilities, AudioProviderConfiguration, AudioSynthesisResult } from './audio-runtime.types';
import { AUDIO_PROVIDER } from './audio-provider.token';
import { normalizeVoiceDirection } from './voice-direction';
import { AudioRuntimeConfiguration } from './audio-runtime.configuration';

export const AUDIO_RUNTIME_VERSION = 'audio-runtime-v1';

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
export { normalizeVoiceDirection } from './voice-direction';

export type PreparedAudioGeneration = {
  projectId: string;
  contentScriptId: string;
  scenePlanId: string;
  provider: AudioProviderConfiguration;
  language: string;
  inputHash: string;
  segments: Array<{ id: string; sceneId: string; sceneIndex: number; narration: string; language: string; voiceDirection: VoiceDirection }>;
  cached: Awaited<ReturnType<AudioGenerationRepository['findByContentScriptId']>> | null;
};

@Injectable()
export class AudioRuntimeService {
  constructor(
    private readonly scripts: ContentScriptRepository,
    private readonly plans: ScenePlanRepository,
    private readonly generations: AudioGenerationRepository,
    @Inject(AUDIO_PROVIDER) private readonly provider: AudioProvider,
    @Inject(AudioRuntimeConfiguration) private readonly runtimeConfiguration: AudioRuntimeConfiguration = new AudioRuntimeConfiguration(),
  ) {}

  async prepare(contentScriptId: string, provider: AudioProviderConfiguration, directions: Readonly<Record<string, Partial<VoiceDirection>>> = {}): Promise<PreparedAudioGeneration> {
    const script = await this.scripts.findById(contentScriptId);
    if (!script) throw new NotFoundException('Content Script not found');
    const plan = await this.plans.findByContentScriptId(contentScriptId);
    if (!plan) throw new ConflictException('Ready Scene Plan is required');
    if (plan.projectId !== script.projectId) throw new NotFoundException('Scene Plan not found');
    if (plan.status !== ScenePlanStatus.READY || plan.scenes.length === 0) throw new ConflictException('Ready Scene Plan is required');
    if (!provider.languageSupport.production.includes(script.language)) throw new ConflictException('This provider does not support the Content Script language for automatic production audio');
    const narration = normalize(plan.scenes.map((scene) => scene.narration).join(' '));
    if (!narration || narration !== normalize(script.fullScript)) throw new ConflictException('Scene Plan narration does not reconcile with Content Script');
    const segments = plan.scenes.map((scene) => ({
      id: createHash('sha256').update(`${plan.id}:${scene.id}:${scene.sceneIndex}:${normalize(scene.narration)}`).digest('hex'),
      sceneId: scene.id,
      sceneIndex: scene.sceneIndex,
      narration: scene.narration,
      language: script.language,
      voiceDirection: normalizeVoiceDirection(directions[scene.id], provider.capabilities),
    }));
    const limits = this.runtimeConfiguration.limits();
    const counts = segments.map((segment) => [...segment.narration].length);
    if (segments.length > limits.maxSegments || counts.some((count) => count > limits.maxCharactersPerSegment) || counts.reduce((sum, count) => sum + count, 0) > limits.maxCharactersPerGeneration) throw new ConflictException('Audio generation exceeds configured safety limits');
    if (!segments.every((segment, index) => segment.sceneIndex === index)) throw new ConflictException('Scene Plan ordering is invalid');
    const inputHash = this.hash(plan, provider, segments);
    const current = await this.generations.findByContentScriptId(contentScriptId);
    return {
      projectId: script.projectId,
      contentScriptId,
      scenePlanId: plan.id,
      provider,
      language: script.language,
      inputHash,
      segments,
      cached: current?.status === AudioGenerationStatus.READY && current.inputHash === inputHash ? current : null,
    };
  }

  async persistReady(prepared: PreparedAudioGeneration, output: readonly AudioSynthesisResult[]) {
    if (prepared.cached) return prepared.cached;
    if (output.length !== prepared.segments.length) throw new ConflictException('Audio output does not match Scene Plan segments');
    let startMs = 0;
    const byId = new Map(output.map((segment) => [segment.segmentId, segment]));
    const segments: AudioSegmentWrite[] = prepared.segments.map((segment) => {
      const generated = byId.get(segment.id);
      if (!generated || !Number.isSafeInteger(generated.actualDurationMs) || generated.actualDurationMs <= 0 || !normalize(generated.audioPath)) throw new ConflictException('Audio output is invalid');
      const write = { id: segment.id, sceneId: segment.sceneId, narration: segment.narration, language: segment.language, actualDurationMs: generated.actualDurationMs, startMs, endMs: startMs + generated.actualDurationMs, audioPath: normalize(generated.audioPath), voiceDirection: segment.voiceDirection, status: AudioSegmentStatus.READY };
      startMs = write.endMs;
      return write;
    });
    return this.generations.upsert({ projectId: prepared.projectId, contentScriptId: prepared.contentScriptId, scenePlanId: prepared.scenePlanId, provider: prepared.provider.provider, model: prepared.provider.model, modelVersion: prepared.provider.modelVersion, voiceId: prepared.provider.voiceId, language: prepared.language, status: AudioGenerationStatus.READY, inputHash: prepared.inputHash, totalDurationMs: startMs, outputPath: null, outputMetadata: { speaker: prepared.provider.voiceId, languageSupport: prepared.provider.languageSupport, degradations: prepared.provider.degradations, segments: output.map((segment) => ({ segmentId: segment.segmentId, telemetry: segment.telemetry ?? null })) }, failureCode: null, failureReason: null }, segments);
  }

  async persistFailure(prepared: PreparedAudioGeneration, code = 'generation_failed') {
    return this.generations.upsertFailurePreservingReady({ projectId: prepared.projectId, contentScriptId: prepared.contentScriptId, scenePlanId: prepared.scenePlanId, provider: prepared.provider.provider, model: prepared.provider.model, modelVersion: prepared.provider.modelVersion, voiceId: prepared.provider.voiceId, language: prepared.language, status: AudioGenerationStatus.FAILED, inputHash: prepared.inputHash, totalDurationMs: null, outputPath: null, outputMetadata: null, failureCode: normalize(code).slice(0, 100) || 'generation_failed', failureReason: 'Audio generation failed', });
  }

  async generate(contentScriptId: string, directions: Readonly<Record<string, Partial<VoiceDirection>>> = {}) {
    if (this.inFlight.has(contentScriptId)) throw new ConflictException('Audio generation is already in progress');
    this.inFlight.add(contentScriptId);
    let workingDirectory: string | undefined;
    let promotedDirectory: string | undefined;
    try {
      const configuration = this.provider.configuration();
      const prepared = await this.prepare(contentScriptId, configuration, directions);
      if (prepared.cached) return prepared.cached;
      const root = resolve(configuration.outputDirectory);
      const temporaryRoot = join(root, '.content-os-audio-tmp');
      workingDirectory = join(temporaryRoot, `${prepared.inputHash}-${randomUUID()}`);
      await mkdir(workingDirectory, { recursive: true });
      const output: AudioSynthesisResult[] = [];
      for (const segment of prepared.segments) {
        const audioPath = join(workingDirectory, `${segment.id}.wav`);
        output.push(await this.provider.synthesize({ segment: { segmentId: segment.id, sceneId: segment.sceneId, sceneIndex: segment.sceneIndex, narration: segment.narration, language: segment.language, voiceDirection: segment.voiceDirection }, outputPath: audioPath }));
      }
      const readyRoot = join(root, 'ready');
      promotedDirectory = join(readyRoot, prepared.inputHash);
      await mkdir(readyRoot, { recursive: true });
      await rename(workingDirectory, promotedDirectory);
      workingDirectory = undefined;
      const promotedOutput = output.map((segment) => ({ ...segment, audioPath: join(promotedDirectory!, basename(segment.audioPath)) }));
      const stored = await this.persistReady(prepared, promotedOutput);
      return stored;
    } catch (error) {
      if (workingDirectory) await rm(workingDirectory, { recursive: true, force: true });
      if (promotedDirectory) await rm(promotedDirectory, { recursive: true, force: true });
      try {
        const configuration = this.provider.configuration();
        const prepared = await this.prepare(contentScriptId, configuration, directions);
        if (!prepared.cached) await this.persistFailure(prepared, this.failureCode(error));
      } catch { /* retain the sanitized generation failure */ }
      throw new InternalServerErrorException('Audio generation failed');
    } finally {
      this.inFlight.delete(contentScriptId);
    }
  }

  async find(contentScriptId: string, projectId: string) {
    const generation = await this.generations.findByContentScriptId(contentScriptId);
    if (!generation || generation.projectId !== projectId) throw new NotFoundException('Audio generation not found');
    return generation;
  }

  async findForContentScript(contentScriptId: string) {
    const script = await this.scripts.findById(contentScriptId);
    if (!script) throw new NotFoundException('Content Script not found');
    return this.find(contentScriptId, script.projectId);
  }

  async streamReadyAudio(contentScriptId: string) {
    const generation = await this.currentReadyGeneration(contentScriptId);
    const readySegments = generation.segments.filter((segment) => segment.status === AudioSegmentStatus.READY && normalize(segment.audioPath ?? ''));
    if (readySegments.length !== 1) throw new ConflictException('A combined audio file is not available for this multi-scene generation');
    return this.streamAudioFile(readySegments[0].audioPath!);
  }

  async streamReadyAudioSegment(contentScriptId: string, segmentId: string) {
    const generation = await this.currentReadyGeneration(contentScriptId);
    const segment = generation.segments.find((candidate) => candidate.id === segmentId);
    if (!segment || segment.status !== AudioSegmentStatus.READY || !normalize(segment.audioPath ?? '')) throw new NotFoundException('Audio segment not found');
    return this.streamAudioFile(segment.audioPath!);
  }

  private async currentReadyGeneration(contentScriptId: string) {
    const generation = await this.findForContentScript(contentScriptId);
    if (generation.status !== AudioGenerationStatus.READY) throw new ConflictException('Ready audio is required');
    const prepared = await this.prepare(contentScriptId, this.provider.configuration());
    if (!prepared.cached || prepared.cached.inputHash !== generation.inputHash) throw new ConflictException('Audio generation is stale');
    return generation;
  }

  private async streamAudioFile(audioPath: string) {
    try {
      const root = await realpath(resolve(this.provider.configuration().outputDirectory));
      const file = await realpath(resolve(audioPath));
      if (!file.startsWith(`${root}${sep}`) || !(await stat(file)).isFile()) throw new NotFoundException('Audio file not found');
      return createReadStream(file);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Audio file not found');
    }
  }

  private hash(plan: { id: string; inputHash: string }, provider: AudioProviderConfiguration, segments: PreparedAudioGeneration['segments']) {
    return createHash('sha256').update(JSON.stringify({ version: AUDIO_RUNTIME_VERSION, scenePlanId: plan.id, scenePlanInputHash: plan.inputHash, provider: { provider: provider.provider, model: provider.model, modelVersion: provider.modelVersion, modelRevision: provider.modelRevision, protocolVersion: provider.protocolVersion, renderStrategyVersion: provider.renderStrategyVersion ?? 'source-equals-render-v1', outputConfiguration: provider.outputConfiguration ?? {}, voiceId: provider.voiceId, languageModes: provider.languageModes, languageSupport: provider.languageSupport, capabilities: provider.capabilities, degradations: provider.degradations }, segments: segments.map(({ id, sceneId, sceneIndex, narration, language, voiceDirection }) => ({ id, sceneId, sceneIndex, narration: normalize(narration), language, voiceDirection })) })).digest('hex');
  }

  private failureCode(error: unknown) {
    const category = error && typeof error === 'object' && typeof Reflect.get(error, 'category') === 'string' ? Reflect.get(error, 'category') : null;
    return category && /^[a-z_]{1,100}$/.test(category) ? category : 'generation_failed';
  }

  private readonly inFlight = new Set<string>();
}
