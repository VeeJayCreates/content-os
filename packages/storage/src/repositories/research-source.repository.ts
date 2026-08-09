import { randomUUID } from 'node:crypto';

import { desc, eq, getTableColumns, and } from 'drizzle-orm';

import { db } from '../db.js';
import {
  NewResearchSource,
  researchSources,
} from '../schema/research-source.js';
import { projects } from '../schema/project.js';

const researchSourceColumns = getTableColumns(researchSources);

export type ResearchSourceWithProject = typeof researchSources.$inferSelect & {
  projectName: string;
};

export class ResearchSourceRepository {
  async findAll(projectId?: string): Promise<ResearchSourceWithProject[]> {
    const query = db
      .select({ ...researchSourceColumns, projectName: projects.name })
      .from(researchSources)
      .innerJoin(projects, eq(researchSources.projectId, projects.id));

    if (projectId) {
      return query
        .where(eq(researchSources.projectId, projectId))
        .orderBy(desc(researchSources.updatedAt));
    }

    return query.orderBy(desc(researchSources.updatedAt));
  }

  async findById(id: string): Promise<ResearchSourceWithProject | undefined> {
    const rows = await db
      .select({ ...researchSourceColumns, projectName: projects.name })
      .from(researchSources)
      .innerJoin(projects, eq(researchSources.projectId, projects.id))
      .where(eq(researchSources.id, id));

    return rows[0];
  }

  async findByProjectAndUrl(
    projectId: string,
    url: string,
  ): Promise<ResearchSourceWithProject | undefined> {
    const rows = await db
      .select({ ...researchSourceColumns, projectName: projects.name })
      .from(researchSources)
      .innerJoin(projects, eq(researchSources.projectId, projects.id))
      .where(
        and(
          eq(researchSources.projectId, projectId),
          eq(researchSources.url, url),
        ),
      );

    return rows[0];
  }

  async create(
    data: Omit<NewResearchSource, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ResearchSourceWithProject> {
    const now = new Date().toISOString();
    const record: NewResearchSource = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    await db.insert(researchSources).values(record);

    return (await this.findById(record.id))!;
  }

  async update(
    id: string,
    data: Partial<Omit<NewResearchSource, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ResearchSourceWithProject | undefined> {
    await db
      .update(researchSources)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(researchSources.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.delete(researchSources).where(eq(researchSources.id, id));
  }
}
