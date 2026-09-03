import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

export type ResearchLogContext = {
  researchRunId?: string;
  projectId?: string;
  sourceId?: string;
  signalId?: string;
  topicCandidateId?: string;
  clusterKey?: string;
  opportunityId?: string;
  researchPackageId?: string;
  evidenceId?: string;
  factId?: string;
  expansionAttemptId?: string;
  provider?: string;
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const FILE_PATTERN = /^research-(\d{4}-\d{2}-\d{2})\.log$/;
const SECRET_KEY = /api.?key|authorization|cookie|password|token|secret|credential/i;
const MAX_STRING_LENGTH = 1_000;
const RESEARCH_EXECUTION_LOG_DIRECTORY = 'RESEARCH_EXECUTION_LOG_DIRECTORY';
const RESEARCH_EXECUTION_LOG_CLOCK = 'RESEARCH_EXECUTION_LOG_CLOCK';

/**
 * Best-effort, local JSONL observability for Research only. File I/O is queued
 * but never awaited by pipeline work, so an unavailable disk cannot fail a run.
 */
@Injectable()
export class ResearchExecutionLogger {
  private readonly fallback = new Logger(ResearchExecutionLogger.name);
  private readonly context = new AsyncLocalStorage<ResearchLogContext>();
  private pending: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(
    @Optional() @Inject(RESEARCH_EXECUTION_LOG_DIRECTORY) directory?: string,
    @Optional() @Inject(RESEARCH_EXECUTION_LOG_CLOCK) now?: () => Date,
  ) {
    this.directory = directory ?? process.env.RESEARCH_EXECUTION_LOG_DIR ?? join(process.cwd(), 'logs', 'research');
    this.now = now ?? (() => new Date());
  }

  private readonly directory: string;
  private readonly now: () => Date;

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      await mkdir(this.directory, { recursive: true });
      const cleanup = await this.cleanupRetention();
      this.event('info', 'research_log.retention_cleanup', 'completed', { result: cleanup });
    } catch (error) {
      this.fallback.warn(`Research execution logging initialization failed (${safeErrorCategory(error)}).`);
    }
  }

  async withRun<T>(projectId: string, callback: (researchRunId: string) => Promise<T>): Promise<T> {
    await this.initialize();
    const researchRunId = randomUUID();
    return this.context.run({ researchRunId, projectId }, async () => {
      this.event('info', 'research_run.started', 'started', { result: { projectId } });
      try {
        const result = await callback(researchRunId);
        this.event('info', 'research_run.completed', 'completed', { result });
        return result;
      } catch (error) {
        this.event('error', 'research_run.failed', 'failed', { result: { failureCategory: safeErrorCategory(error) } });
        throw error;
      }
    });
  }

  withContext<T>(values: ResearchLogContext, callback: () => T): T {
    return this.context.run({ ...(this.context.getStore() ?? {}), ...omitUndefined(values) }, callback);
  }

  event(level: LogLevel, event: string, status: string, values: { result?: unknown; durationMs?: number; context?: ResearchLogContext } = {}) {
    const record = sanitize({
      timestamp: this.now().toISOString(),
      level,
      ...this.context.getStore(),
      ...omitUndefined(values.context ?? {}),
      event,
      status,
      result: values.result ?? null,
      durationMs: values.durationMs ?? null,
    });
    this.pending = this.pending
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        await appendFile(this.filePath(this.now()), `${JSON.stringify(record)}\n`, 'utf8');
      })
      .catch((error) => this.fallback.warn(`Research execution log write failed (${safeErrorCategory(error)}).`));
  }

  async flushForTests() { await this.pending; }

  filePath(date = this.now()) { return join(this.directory, `research-${localDate(date)}.log`); }

  async cleanupRetention() {
    const cutoff = startOfLocalDay(this.now());
    cutoff.setDate(cutoff.getDate() - 4);
    const inspected: string[] = [];
    const deleted: string[] = [];
    try {
      for (const name of await readdir(this.directory)) {
        const match = FILE_PATTERN.exec(name);
        if (!match?.[1]) continue;
        inspected.push(name);
        if (new Date(`${match[1]}T00:00:00`).getTime() < cutoff.getTime()) {
          await rm(join(this.directory, name), { force: true });
          deleted.push(name);
        }
      }
    } catch (error) {
      return { inspected, deleted, failureCategory: safeErrorCategory(error) };
    }
    return { inspected, deleted, failureCategory: null };
  }
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function startOfLocalDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function omitUndefined<T extends object>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T; }
function safeErrorCategory(error: unknown) { return error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name.slice(0, 80) : 'unknown_error'; }
function sanitize(value: unknown): unknown {
  if (typeof value === 'string') return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[redacted]' : sanitize(item)]));
}
