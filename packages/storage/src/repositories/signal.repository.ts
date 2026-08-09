import { randomUUID } from 'node:crypto';

import { and, desc, eq, getTableColumns } from 'drizzle-orm';

import { db } from '../db.js';
import { projects } from '../schema/project.js';
import { researchSources } from '../schema/research-source.js';
import { NewSignal, signals } from '../schema/signal.js';

const columns = getTableColumns(signals);

export type SignalWithContext = typeof signals.$inferSelect & {
  projectName: string;
  sourceName: string;
};

export type SignalCreateResult = 'created' | 'duplicate';

export class SignalRepository {
  async findAll(
    projectId?: string,
    researchSourceId?: string,
  ): Promise<SignalWithContext[]> {
    const query = db
      .select({
        ...columns,
        projectName: projects.name,
        sourceName: researchSources.name,
      })
      .from(signals)
      .innerJoin(projects, eq(signals.projectId, projects.id))
      .innerJoin(researchSources, eq(signals.researchSourceId, researchSources.id));

    if (projectId && researchSourceId) {
      return query
        .where(
          and(
            eq(signals.projectId, projectId),
            eq(signals.researchSourceId, researchSourceId),
          ),
        )
        .orderBy(desc(signals.discoveredAt));
    }

    if (projectId) {
      return query
        .where(eq(signals.projectId, projectId))
        .orderBy(desc(signals.discoveredAt));
    }

    if (researchSourceId) {
      return query
        .where(eq(signals.researchSourceId, researchSourceId))
        .orderBy(desc(signals.discoveredAt));
    }

    return query.orderBy(desc(signals.discoveredAt));
  }

  async findById(id: string): Promise<SignalWithContext | undefined> {
    const rows = await db
      .select({
        ...columns,
        projectName: projects.name,
        sourceName: researchSources.name,
      })
      .from(signals)
      .innerJoin(projects, eq(signals.projectId, projects.id))
      .innerJoin(researchSources, eq(signals.researchSourceId, researchSources.id))
      .where(eq(signals.id, id));

    return rows[0];
  }

  async create(
    data: Omit<NewSignal, 'id' | 'createdAt'>,
  ): Promise<SignalCreateResult> {
    try {
      await db.insert(signals).values({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...data,
      });

      return 'created';
    } catch (error) {
      if (this.isDuplicateError(error)) {
        return 'duplicate';
      }

      throw error;
    }
  }

  private isDuplicateError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const sqliteError = error as { code?: unknown; message?: unknown };

    return (
      sqliteError.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      (sqliteError.code === 'SQLITE_CONSTRAINT' &&
        typeof sqliteError.message === 'string' &&
        sqliteError.message.includes(
          'UNIQUE constraint failed: signals.research_source_id, signals.external_id',
        ))
    );
  }
}
