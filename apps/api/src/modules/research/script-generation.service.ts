import { createHash } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AiExecutionMode,
  AiTask,
  ContentStylePreset,
  ProductionQueueStatus,
  ScriptFormat,
  ScriptLanguage,
  ScriptStatus,
  normalizeContentStyleProfile,
  type ContentScript,
  type ProjectContentStyleProfile,
  type ProjectContentStyleProfileUpdateInput,
} from '@content-os/contracts';
import {
  ContentScriptRepository,
  ContentStyleProfileRepository,
  EditorialAssessmentRepository,
  ProductionQueueRepository,
  ResearchPackageRepository,
} from '@content-os/storage';

import { AiRuntime } from '../ai/ai-runtime.service';
import { contentStylePreset } from '../project/content-style-profile.service';
import { ProductionQueueContentAngleService } from './production-queue-content-angle.service';

export const CONTENT_PACKAGE_PROMPT_VERSION = 'content-package-v1';
// Kept as an export alias for Script Generation consumers during the additive migration.
export const SCRIPT_GENERATION_PROMPT_VERSION = CONTENT_PACKAGE_PROMPT_VERSION;
export const SCRIPT_GENERATION_SYSTEM_PROMPT = `You create one grounded Content Package, not separate metadata. Use only the supplied verified facts and grounded Content Angle. Never invent facts, dates, numbers, quotes, source claims, or citations. Style changes presentation only and never factual certainty. Do not use sarcasm about deaths, victims, terrorism casualties, disasters, or severe suffering when sensitiveTopicSarcasmEnabled is false. Return JSON only with exactly these fields: {"hook":"string","body":"string","closing":"string","fullScript":"string","citedFactIds":["fact-id"],"primaryTitle":"string","alternateTitles":["string"],"description":"string","tags":["string"],"hashtags":["#string"],"keywords":["string"],"thumbnailText":"string","thumbnailCreativeBrief":"string","metadataFactIds":["fact-id"]}. First write the grounded narration, then derive all publishing metadata and thumbnail copy from that same narration. Every cited ID and metadataFactId must be supplied. Titles, description, and thumbnail copy must not convert uncertainty into certainty. Do not include hidden reasoning.`;

export type ContentStyleOverride = Partial<ProjectContentStyleProfileUpdateInput>;
export type ScriptGenerationOptions = {
  format?: ScriptFormat;
  language?: ScriptLanguage;
  targetDurationSeconds?: number;
  style?: ContentStyleOverride;
};

export type PreparedScriptGeneration = {
  queueItemId: string;
  projectId: string;
  opportunityId: string;
  researchPackageId: string;
  editorialAssessmentId: string;
  input: ContentPackageInput;
  inputHash: string;
  cached: ContentScript | null;
};

type ContentPackageInput = {
  language: ScriptLanguage;
  format: ScriptFormat;
  targetDurationSeconds: number;
  targetWordCount: number;
  contentAngle: { angleType: string; videoIdeaTitle: string; videoIdeaSummary: string | null; hook: string | null; whyNow: string | null };
  facts: { id: string; claim: string; status: string }[];
  signals: string[];
  style: ReturnType<typeof normalizeContentStyleProfile>;
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
    private readonly styles: ContentStyleProfileRepository,
    private readonly runtime: AiRuntime,
  ) {}

  async generate(queueItemId: string, options: ScriptGenerationOptions = {}): Promise<ContentScript> {
    const prepared = await this.prepare(queueItemId, options);
    if (prepared.cached) return prepared.cached;
    try {
      const output = await this.runtime.structuredGeneration({
        task: AiTask.CONTENT_PACKAGE_GENERATION,
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
      throw new ConflictException('A grounded Content Angle is required before content package generation');
    }
    const format = options.format ?? ScriptFormat.YOUTUBE_SHORT;
    const style = await this.resolveStyle(context.opportunity.projectId, options.style);
    const language = options.language ?? style.primaryLanguage ?? ScriptLanguage.ENGLISH;
    const duration = this.duration(format, options.targetDurationSeconds);
    const input = await this.input(context.item.researchPackageId, {
      angleType: assessment.angleType,
      videoIdeaTitle: assessment.videoIdeaTitle,
      videoIdeaSummary: assessment.videoIdeaSummary,
      hook: assessment.hook,
      whyNow: assessment.whyNow,
    }, format, language, duration, style);
    const inputHash = createHash('sha256').update(JSON.stringify({ input, promptVersion: CONTENT_PACKAGE_PROMPT_VERSION })).digest('hex');
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
    const route = this.runtime.route(AiTask.CONTENT_PACKAGE_GENERATION);
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
      promptVersion: CONTENT_PACKAGE_PROMPT_VERSION,
      inputHash: prepared.inputHash,
      generatedAt: new Date().toISOString(),
    }) as Promise<ContentScript>;
  }

  async find(queueItemId: string): Promise<ContentScript> {
    const script = await this.scripts.findByQueueItemId(queueItemId);
    if (!script) throw new NotFoundException('Script not found');
    return script as ContentScript;
  }

  private async resolveStyle(projectId: string, override: ContentStyleOverride | undefined): Promise<ReturnType<typeof normalizeContentStyleProfile>> {
    const stored = await this.styles.findByProjectId(projectId);
    const base: ProjectContentStyleProfile = stored
      ? stored as ProjectContentStyleProfile
      : { projectId, ...contentStylePreset(ContentStylePreset.CUSTOM), createdAt: '', updatedAt: '' };
    return normalizeContentStyleProfile({ ...base, ...override, projectId, createdAt: base.createdAt, updatedAt: base.updatedAt });
  }

  private duration(format: ScriptFormat, requested: number | undefined) {
    if (format === ScriptFormat.YOUTUBE_SHORT) return 60;
    const duration = requested ?? defaultDuration(format);
    if (!Number.isSafeInteger(duration) || duration < 60 || duration > 3_600) throw new ConflictException('Long-form script duration must be between 60 and 3600 seconds');
    return duration;
  }

  private async input(researchPackageId: string, assessment: ContentPackageInput['contentAngle'], format: ScriptFormat, language: ScriptLanguage, targetDurationSeconds: number, style: ContentPackageInput['style']): Promise<ContentPackageInput> {
    const rows = (await this.packages.findFactsWithEvidenceByPackageIds([researchPackageId])).get(researchPackageId) ?? [];
    const facts = [...new Map(rows.map((row) => [row.id, { id: row.id, claim: row.claim, status: row.status }])).values()];
    if (!facts.length) throw new ConflictException('Candidate-safe Research Package facts are required');
    return { language, format, targetDurationSeconds, targetWordCount: wordCountFor(targetDurationSeconds), contentAngle: assessment, facts, signals: [...new Set(rows.map((row) => row.signalId).filter((id): id is string => Boolean(id)))], style };
  }

  private validate(value: unknown, facts: Set<string>, format: ScriptFormat) {
    if (!value || typeof value !== 'object') throw new ConflictException('Content package output is invalid');
    const get = (key: string) => Reflect.get(value, key);
    const text = (key: string, max: number) => {
      const field = get(key);
      if (typeof field !== 'string' || !field.trim() || field.trim().length > max) throw new ConflictException('Content package output is invalid');
      return field.trim();
    };
    const ids = (key: string) => {
      const value = get(key);
      if (!Array.isArray(value) || !value.length || !value.every((id) => typeof id === 'string' && facts.has(id))) throw new ConflictException('Content package cites unsupported facts');
      return [...new Set(value)];
    };
    const words = (key: string, maxItems: number, maxLength: number, prefix = '') => {
      const value = get(key);
      if (!Array.isArray(value) || !value.length || value.length > maxItems || !value.every((word) => typeof word === 'string' && word.trim() && word.trim().length <= maxLength)) throw new ConflictException('Content package metadata is invalid');
      const normalized = [...new Set(value.map((word) => `${prefix}${word.trim().replace(/^#+/, '')}`))];
      if (normalized.length !== value.length) throw new ConflictException('Content package metadata contains duplicates');
      return normalized;
    };
    const citedFactIds = ids('citedFactIds');
    const metadataFactIds = ids('metadataFactIds');
    const hook = text('hook', 300);
    if (format === ScriptFormat.YOUTUBE_SHORT && hook.length < 8) throw new ConflictException('Short-form scripts require a strong hook');
    const tags = words('tags', 20, 50);
    if (tags.join(',').length > 500) throw new ConflictException('Content package tags exceed the practical length limit');
    return {
      hook,
      body: text('body', 20_000),
      closing: text('closing', 1_000),
      fullScript: text('fullScript', 25_000),
      citedFactIds: [...new Set([...citedFactIds, ...metadataFactIds])],
      primaryTitle: text('primaryTitle', 120),
      alternateTitles: words('alternateTitles', 5, 120),
      description: text('description', 5_000),
      tags,
      hashtags: words('hashtags', 8, 60, '#'),
      keywords: words('keywords', 20, 80),
      thumbnailText: text('thumbnailText', 60),
      thumbnailCreativeBrief: text('thumbnailCreativeBrief', 1_000),
    };
  }
}
