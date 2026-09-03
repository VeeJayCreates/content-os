import { createHash } from 'node:crypto';

import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { AiExecutionMode, AiTask, SceneMediaStrategy, ScenePlanStatus, SceneType, type GeographicEntity } from '@content-os/contracts';
import { ContentScriptRepository, ScenePlanRepository, type PlannedSceneWrite } from '@content-os/storage';

import { AiRuntime } from '../ai/ai-runtime.service';
import { AiRuntimeProviderError } from '../ai/ai-runtime.types';

export const SCENE_PLAN_VERSION = 'scene-plan-v1';
export const SCENE_PLANNING_PROMPT_VERSION = 'scene-planning-v1';
export const SCENE_PLANNING_SYSTEM_PROMPT = `Create visual enrichment for the supplied ordered narration segments. Return JSON only: {"scenes":[{"id":"exact supplied id","index":0,"narration":"exact supplied narration","sceneType":"presenter|b_roll|map|animation|image|generated_video|screen_demo|chart_or_screenshot|text","mediaStrategy":"reusable_asset|existing_asset|stock_or_source_footage|programmatic_animation|reusable_map_animation|ai_image|ai_image_to_video|generated_video|screen_capture|presenter|text_only|manual","visualDescription":"short grounded visual direction","primarySearchQuery":"optional string or null","alternateSearchQueries":["optional string"],"generatedMediaPrompt":"optional string or null","onScreenText":"optional string or null","subtitleText":"exact supplied narration","citedFactIds":["only supplied fact ids"],"geographicEntityIds":["only supplied geographic entity ids"],"transitionRecommendation":"optional string or null","continuityNotes":"optional string or null","manualReview":false,"manualReviewReason":"optional string or null"}]}. Preserve every supplied scene id, index, and narration exactly. Do not rewrite, add, remove, reorder, merge, or split narration. Use only supplied fact IDs and supplied geographic entity IDs. Do not invent facts, citations, geographic entities, or coordinates. Do not include hidden reasoning.`;

export type NarrationSegment = { id: string; narration: string; narrationWordCount: number; estimatedDurationMs: number; startEstimateMs: number; endEstimateMs: number };
type ProviderScene = Omit<PlannedSceneWrite, 'id' | 'narrationWordCount' | 'estimatedDurationMs' | 'startEstimateMs' | 'endEstimateMs'> & { id: string; index: number; narration: string };
export type PreparedScenePlan = { contentScriptId: string; projectId: string; inputHash: string; segments: NarrationSegment[]; factIds: string[]; geographicEntities: GeographicEntity[]; language: string; cached: Awaited<ReturnType<ScenePlanRepository['findByContentScriptId']>> | null };

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const words = (value: string) => normalize(value).split(' ').filter(Boolean);
const enumIncludes = <T extends Record<string, string>>(source: T, value: unknown): value is T[keyof T] => typeof value === 'string' && Object.values(source).includes(value);

export function segmentNarration(script: string, contentScriptId = 'segment', wordsPerMinute = 135): NarrationSegment[] {
  const source = normalize(script);
  if (!source) throw new ConflictException('Completed script narration is required');
  const sentences = source.match(/[^.!?।]+[.!?।]*/g)?.map(normalize).filter(Boolean) ?? [source];
  const groups: string[] = [];
  for (const sentence of sentences) {
    const prior = groups.at(-1);
    if (prior && words(sentence).length < 5 && words(prior).length < 28) groups[groups.length - 1] = `${prior} ${sentence}`;
    else groups.push(sentence);
  }
  const blocks = groups.flatMap((group) => {
    const groupWords = words(group);
    if (groupWords.length <= 32) return [group];
    return Array.from({ length: Math.ceil(groupWords.length / 32) }, (_, index) => groupWords.slice(index * 32, (index + 1) * 32).join(' '));
  });
  let startEstimateMs = 0;
  return blocks.map((narration, index) => {
    const narrationWordCount = words(narration).length;
    const estimatedDurationMs = Math.max(1_200, Math.round((narrationWordCount / wordsPerMinute) * 60_000));
    const id = createHash('sha256').update(`${contentScriptId}:${index}:${normalize(narration)}`).digest('hex');
    const segment = { id, narration, narrationWordCount, estimatedDurationMs, startEstimateMs, endEstimateMs: startEstimateMs + estimatedDurationMs };
    startEstimateMs = segment.endEstimateMs;
    return segment;
  });
}

@Injectable()
export class ScenePlanningService {
  private readonly inFlight = new Set<string>();
  private readonly logger = new Logger(ScenePlanningService.name);

  constructor(
    private readonly scripts: ContentScriptRepository,
    private readonly plans: ScenePlanRepository,
    private readonly runtime: AiRuntime,
  ) {}

  async generate(contentScriptId: string) {
    if (this.inFlight.has(contentScriptId)) throw new ConflictException('Scene Plan generation is already in progress');
    this.inFlight.add(contentScriptId);
    try {
      const prepared = await this.prepare(contentScriptId);
      if (prepared.cached) return prepared.cached;

      const route = this.runtime.route(AiTask.SCENE_PLANNING);
      try {
        const response = await this.runtime.structuredGeneration({
          task: AiTask.SCENE_PLANNING,
          projectId: prepared.projectId,
          systemPrompt: SCENE_PLANNING_SYSTEM_PROMPT,
          input: this.runtimeInput(prepared),
        });
        return await this.persistPrepared(prepared, response, AiExecutionMode.SYNCHRONOUS);
      } catch (error) {
        await this.persistFailureByPrepared(prepared, route.provider, route.model);
        if (error instanceof AiRuntimeProviderError) this.logger.warn(JSON.stringify({ event: 'scene_planning_runtime_failure', provider: route.provider, model: route.model, category: error.category, status: error.status, providerCode: error.code ?? null }));
        else if (!(error instanceof ConflictException)) this.logger.warn(JSON.stringify({ event: 'scene_planning_runtime_failure', provider: route.provider, model: route.model, category: 'internal_or_unknown', status: null, providerCode: null }));
        if (error instanceof ConflictException) throw error;
        throw new InternalServerErrorException('Scene Plan generation failed');
      }
    } finally {
      this.inFlight.delete(contentScriptId);
    }
  }

  async find(contentScriptId: string) {
    const script = await this.scripts.findById(contentScriptId);
    if (!script) throw new NotFoundException('Content Script not found');
    const plan = await this.plans.findByContentScriptId(contentScriptId);
    if (!plan) throw new NotFoundException('Scene Plan not found');
    if (plan.projectId !== script.projectId) throw new NotFoundException('Scene Plan not found');
    return plan;
  }

  async prepare(contentScriptId: string): Promise<PreparedScenePlan> {
    const script = await this.requireReadyScript(contentScriptId);
    const segments = segmentNarration(script.fullScript, script.id);
    this.assertReconciliation(script.fullScript, segments);
    const geographicEntities = Array.isArray(script.geographicEntities) ? script.geographicEntities as GeographicEntity[] : [];
    const inputHash = this.inputHash(script.inputHash, segments, geographicEntities);
    const current = await this.plans.findByContentScriptId(contentScriptId);
    return { contentScriptId, projectId: script.projectId, inputHash, segments, factIds: script.citedFactIds, geographicEntities, language: script.language, cached: current?.status === ScenePlanStatus.READY && current.inputHash === inputHash ? current : null };
  }

  runtimeInput(prepared: PreparedScenePlan) {
    return { contentScriptId: prepared.contentScriptId, language: prepared.language, segments: prepared.segments.map((segment) => ({ ...segment, citedFactIds: prepared.factIds })), factIds: prepared.factIds, geographicEntities: prepared.geographicEntities };
  }

  async persistPrepared(prepared: PreparedScenePlan, output: unknown, executionMode: AiExecutionMode) {
    const script = await this.requireReadyScript(prepared.contentScriptId);
    const currentHash = this.inputHash(script.inputHash, prepared.segments, prepared.geographicEntities);
    if (currentHash !== prepared.inputHash) throw new ConflictException('Content Package input changed before Scene Plan completion');
    const route = this.runtime.route(AiTask.SCENE_PLANNING);
    const scenes = this.validateOutput(output, prepared.segments, new Set(prepared.factIds), new Set(prepared.geographicEntities.map((entity) => entity.id)));
    return this.plans.upsert(this.planWrite(script, prepared.inputHash, route.provider, route.model, executionMode, ScenePlanStatus.READY, prepared.segments), scenes);
  }

  async persistBatchFailure(prepared: PreparedScenePlan, category = 'generation_failed') {
    const route = this.runtime.route(AiTask.SCENE_PLANNING);
    await this.persistFailureByPrepared(prepared, route.provider, route.model, category);
  }

  private async requireReadyScript(contentScriptId: string) {
    const script = await this.scripts.findById(contentScriptId);
    if (!script) throw new NotFoundException('Content Script not found');
    if (script.status !== 'ready') throw new ConflictException('Content Script is not ready');
    if (!normalize(script.fullScript)) throw new ConflictException('Completed script narration is required');
    return script;
  }

  private inputHash(scriptInputHash: string, segments: NarrationSegment[], geographicEntities: GeographicEntity[] = []) {
    return createHash('sha256').update(JSON.stringify({ scriptInputHash, version: SCENE_PLAN_VERSION, promptVersion: SCENE_PLANNING_PROMPT_VERSION, segments: segments.map(({ id, narration }) => ({ id, narration })), geographicEntities })).digest('hex');
  }

  private assertReconciliation(script: string, segments: NarrationSegment[]) {
    if (normalize(segments.map((segment) => segment.narration).join(' ')) !== normalize(script)) throw new ConflictException('Narration reconciliation failed');
  }

  private validateOutput(value: unknown, segments: NarrationSegment[], allowedFactIds: Set<string>, allowedGeographicEntityIds = new Set<string>()): PlannedSceneWrite[] {
    if (!value || typeof value !== 'object' || !Array.isArray(Reflect.get(value, 'scenes'))) throw new ConflictException('Scene Plan output is invalid');
    const output = Reflect.get(value, 'scenes') as unknown[];
    if (output.length !== segments.length) throw new ConflictException('Scene Plan output does not match narration segments');
    return output.map((item, index) => {
      if (!item || typeof item !== 'object') throw new ConflictException('Scene Plan output is invalid');
      const segment = segments[index];
      const get = (key: string) => Reflect.get(item, key);
      if (get('id') !== segment.id || get('index') !== index || normalize(String(get('narration') ?? '')) !== normalize(segment.narration) || normalize(String(get('subtitleText') ?? '')) !== normalize(segment.narration)) throw new ConflictException('Scene Plan narration was changed');
      const sceneType = get('sceneType'); const mediaStrategy = get('mediaStrategy');
      if (!enumIncludes(SceneType, sceneType) || !enumIncludes(SceneMediaStrategy, mediaStrategy)) throw new ConflictException('Scene Plan output uses unsupported visual enums');
      const visualDescription = this.text(get('visualDescription'), 1_000, 'Scene Plan output is invalid');
      const citedFactIds = this.stringList(get('citedFactIds'), 30, 100);
      if (citedFactIds.some((factId) => !allowedFactIds.has(factId))) throw new ConflictException('Scene Plan cites unsupported facts');
      const geographicEntityIds = this.stringList(get('geographicEntityIds') ?? [], 12, 100);
      if (geographicEntityIds.some((id) => !allowedGeographicEntityIds.has(id))) throw new ConflictException('Scene Plan selects unsupported geographic entities');
      return {
        id: segment.id, narration: segment.narration, narrationWordCount: segment.narrationWordCount, estimatedDurationMs: segment.estimatedDurationMs, startEstimateMs: segment.startEstimateMs, endEstimateMs: segment.endEstimateMs,
        sceneType, mediaStrategy, visualDescription, primarySearchQuery: this.optionalText(get('primarySearchQuery'), 300), alternateSearchQueries: this.stringList(get('alternateSearchQueries'), 5, 300),
        generatedMediaPrompt: this.optionalText(get('generatedMediaPrompt'), 1_000), onScreenText: this.optionalText(get('onScreenText'), 300), subtitleText: segment.narration, citedFactIds, geographicEntityIds,
        transitionRecommendation: this.optionalText(get('transitionRecommendation'), 200), continuityNotes: this.optionalText(get('continuityNotes'), 500), manualReview: typeof get('manualReview') === 'boolean' ? get('manualReview') : false,
        manualReviewReason: this.optionalText(get('manualReviewReason'), 300),
      };
    });
  }

  private text(value: unknown, max: number, message: string) { if (typeof value !== 'string' || !normalize(value) || normalize(value).length > max) throw new ConflictException(message); return normalize(value); }
  private optionalText(value: unknown, max: number) { if (value === null || value === undefined) return null; return this.text(value, max, 'Scene Plan output is invalid'); }
  private stringList(value: unknown, maxItems: number, maxLength: number) { if (!Array.isArray(value) || value.length > maxItems || !value.every((item) => typeof item === 'string' && normalize(item) && normalize(item).length <= maxLength)) throw new ConflictException('Scene Plan output is invalid'); return [...new Set(value.map(normalize))]; }

  private planWrite(script: Awaited<ReturnType<ContentScriptRepository['findById']>> & {}, inputHash: string, provider: string, model: string | null, executionMode: AiExecutionMode, status: ScenePlanStatus, segments: NarrationSegment[]) {
    return { projectId: script.projectId, contentScriptId: script.id, status, version: SCENE_PLAN_VERSION, totalEstimatedDurationMs: segments.at(-1)?.endEstimateMs ?? 0, sceneCount: segments.length, provider, model, executionMode, promptVersion: SCENE_PLANNING_PROMPT_VERSION, inputHash, failureCode: null, failureReason: null };
  }

  private async persistFailureByPrepared(prepared: PreparedScenePlan, provider: string, model: string | null, failureCode = 'generation_failed') {
    try {
      const script = await this.requireReadyScript(prepared.contentScriptId);
      await this.plans.upsert({ ...this.planWrite(script, prepared.inputHash, provider, model, AiExecutionMode.SYNCHRONOUS, ScenePlanStatus.FAILED, prepared.segments), failureCode, failureReason: 'Scene Plan generation failed' }, []);
    } catch { /* preserve the sanitized original failure */ }
  }
}
