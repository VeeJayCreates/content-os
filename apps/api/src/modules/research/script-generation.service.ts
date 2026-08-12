import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AiExecutionMode, AiTask, ProductionQueueStatus, ScriptFormat, ScriptLanguage, ScriptStatus, type ContentScript } from '@content-os/contracts';
import { ContentScriptRepository, EditorialAssessmentRepository, ProductionQueueRepository, ResearchPackageRepository } from '@content-os/storage';
import { AiRuntime } from '../ai/ai-runtime.service';
import { ProductionQueueContentAngleService } from './production-queue-content-angle.service';

export const SCRIPT_GENERATION_PROMPT_VERSION = 'script-generation-v1';
export const SCRIPT_GENERATION_SYSTEM_PROMPT = `You are a scriptwriter, not a researcher. Use only the supplied verified facts and Content Angle. Never invent facts, dates, numbers, quotes, or citations. Write spoken narration in the requested language and return JSON only: {"hook":"string","body":"string","closing":"string","fullScript":"string","citedFactIds":["fact-id"]}. Every factual statement must cite only supplied fact IDs. A YouTube Short must begin with a strong hook and stay concise. A YouTube Long may use clear spoken sections. Do not include hidden reasoning.`;

export type ScriptGenerationOptions = {
  format?: ScriptFormat;
  language?: ScriptLanguage;
  targetDurationSeconds?: number;
};

export type PreparedScriptGeneration = {
  queueItemId: string;
  projectId: string;
  opportunityId: string;
  researchPackageId: string;
  editorialAssessmentId: string;
  input: ScriptInput;
  inputHash: string;
  cached: ContentScript | null;
};

type ScriptInput = {
  language: ScriptLanguage;
  format: ScriptFormat;
  targetDurationSeconds: number;
  targetWordCount: number;
  contentAngle: { angleType: string; videoIdeaTitle: string; videoIdeaSummary: string | null; hook: string | null; whyNow: string | null };
  facts: { id: string; claim: string; status: string }[];
  signals: string[];
};

const defaultDuration = (format: ScriptFormat) => format === ScriptFormat.YOUTUBE_SHORT ? 60 : 480;
const wordCountFor = (durationSeconds: number) => Math.round(durationSeconds * 2.25);

@Injectable()
export class ScriptGenerationService {
  constructor(
    private readonly queue: ProductionQueueRepository,
    private readonly angles: ProductionQueueContentAngleService,
    private readonly packages: ResearchPackageRepository,
    private readonly assessments: EditorialAssessmentRepository,
    private readonly scripts: ContentScriptRepository,
    private readonly runtime: AiRuntime,
  ) {}

  async generate(queueItemId: string, options: ScriptGenerationOptions = {}): Promise<ContentScript> {
    const prepared = await this.prepare(queueItemId, options);
    if (prepared.cached) return prepared.cached;
    try {
      const output = await this.runtime.structuredGeneration({
        task: AiTask.SCRIPT_GENERATION,
        projectId: prepared.projectId,
        systemPrompt: SCRIPT_GENERATION_SYSTEM_PROMPT,
        input: prepared.input,
      });
      return await this.persistPrepared(prepared, output, AiExecutionMode.SYNCHRONOUS);
    } catch (error) {
      await this.queue.updateStatus(queueItemId, ProductionQueueStatus.FAILED);
      throw error;
    }
  }

  async prepare(queueItemId: string, options: ScriptGenerationOptions = {}): Promise<PreparedScriptGeneration> {
    const context = await this.angles.resolveEligibleContext(queueItemId);
    const assessment = await this.assessments.find(context.opportunity.projectId, context.opportunity.id);
    if (!assessment || assessment.status !== 'ready' || assessment.researchPackageId !== context.item.researchPackageId || !assessment.angleType || !assessment.videoIdeaTitle) {
      throw new ConflictException('A grounded Content Angle is required before script generation');
    }
    const format = options.format ?? ScriptFormat.YOUTUBE_SHORT;
    const language = options.language ?? ScriptLanguage.ENGLISH;
    const duration = this.duration(format, options.targetDurationSeconds);
    const input = await this.input(context.item.researchPackageId, {
      angleType: assessment.angleType,
      videoIdeaTitle: assessment.videoIdeaTitle,
      videoIdeaSummary: assessment.videoIdeaSummary,
      hook: assessment.hook,
      whyNow: assessment.whyNow,
    }, format, language, duration);
    const inputHash = createHash('sha256').update(JSON.stringify({ input, promptVersion: SCRIPT_GENERATION_PROMPT_VERSION })).digest('hex');
    const existing = await this.scripts.findByQueueItemId(queueItemId);
    return {
      queueItemId,
      projectId: context.opportunity.projectId,
      opportunityId: context.opportunity.id,
      researchPackageId: context.item.researchPackageId,
      editorialAssessmentId: assessment.id,
      input,
      inputHash,
      cached: existing?.status === ScriptStatus.READY && existing.inputHash === inputHash ? existing as ContentScript : null,
    };
  }

  async persistPrepared(prepared: PreparedScriptGeneration, value: unknown, executionMode: AiExecutionMode): Promise<ContentScript> {
    const output = this.validate(value, new Set(prepared.input.facts.map((fact) => fact.id)), prepared.input.format);
    const route = this.runtime.route(AiTask.SCRIPT_GENERATION);
    return this.scripts.upsert({
      projectId: prepared.projectId,
      opportunityId: prepared.opportunityId,
      productionQueueItemId: prepared.queueItemId,
      researchPackageId: prepared.researchPackageId,
      editorialAssessmentId: prepared.editorialAssessmentId,
      format: prepared.input.format,
      language: prepared.input.language,
      targetDurationSeconds: prepared.input.targetDurationSeconds,
      targetWordCount: prepared.input.targetWordCount,
      ...output,
      status: ScriptStatus.READY,
      provider: route.provider,
      model: route.model,
      executionMode,
      promptVersion: SCRIPT_GENERATION_PROMPT_VERSION,
      inputHash: prepared.inputHash,
      generatedAt: new Date().toISOString(),
    }) as Promise<ContentScript>;
  }

  async find(queueItemId: string): Promise<ContentScript> {
    const script = await this.scripts.findByQueueItemId(queueItemId);
    if (!script) throw new NotFoundException('Script not found');
    return script as ContentScript;
  }

  private duration(format: ScriptFormat, requested: number | undefined) {
    if (format === ScriptFormat.YOUTUBE_SHORT) return 60;
    const duration = requested ?? defaultDuration(format);
    if (!Number.isSafeInteger(duration) || duration < 60 || duration > 3_600) {
      throw new ConflictException('Long-form script duration must be between 60 and 3600 seconds');
    }
    return duration;
  }

  private async input(researchPackageId: string, assessment: ScriptInput['contentAngle'], format: ScriptFormat, language: ScriptLanguage, targetDurationSeconds: number): Promise<ScriptInput> {
    const rows = (await this.packages.findFactsWithEvidenceByPackageIds([researchPackageId])).get(researchPackageId) ?? [];
    const facts = [...new Map(rows.map((row) => [row.id, { id: row.id, claim: row.claim, status: row.status }])).values()];
    if (!facts.length) throw new ConflictException('Candidate-safe Research Package facts are required');
    return {
      language,
      format,
      targetDurationSeconds,
      targetWordCount: wordCountFor(targetDurationSeconds),
      contentAngle: assessment,
      facts,
      signals: [...new Set(rows.map((row) => row.signalId).filter((id): id is string => Boolean(id)))],
    };
  }

  private validate(value: unknown, facts: Set<string>, format: ScriptFormat) {
    if (!value || typeof value !== 'object') throw new ConflictException('Script output is invalid');
    const get = (key: string) => Reflect.get(value, key);
    const text = (key: string, max: number) => {
      const field = get(key);
      if (typeof field !== 'string' || !field.trim() || field.trim().length > max) throw new ConflictException('Script output is invalid');
      return field.trim();
    };
    const citedFactIds = get('citedFactIds');
    if (!Array.isArray(citedFactIds) || !citedFactIds.every((id) => typeof id === 'string' && facts.has(id))) throw new ConflictException('Script cites unsupported facts');
    const hook = text('hook', 300);
    if (format === ScriptFormat.YOUTUBE_SHORT && hook.length < 8) throw new ConflictException('Short-form scripts require a strong hook');
    return { hook, body: text('body', 20_000), closing: text('closing', 1_000), fullScript: text('fullScript', 25_000), citedFactIds: [...new Set(citedFactIds)] };
  }
}
