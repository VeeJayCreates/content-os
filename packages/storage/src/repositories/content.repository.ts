import { randomUUID } from 'node:crypto';

import { desc, eq, getTableColumns } from 'drizzle-orm';

import { db } from '../db.js';
import { content, NewContent } from '../schema/content.js';
import { projects } from '../schema/project.js';

const contentColumns = getTableColumns(content);

export type ContentWithProject = typeof content.$inferSelect & {
  projectName: string;
};

export class ContentRepository {
  async findAll(projectId?: string): Promise<ContentWithProject[]> {
    const query = db
      .select({ ...contentColumns, projectName: projects.name })
      .from(content)
      .innerJoin(projects, eq(content.projectId, projects.id));

    if (projectId) {
      return query
        .where(eq(content.projectId, projectId))
        .orderBy(desc(content.updatedAt));
    }

    return query.orderBy(desc(content.updatedAt));
  }

  async findById(id: string): Promise<ContentWithProject | undefined> {
    const rows = await db
      .select({ ...contentColumns, projectName: projects.name })
      .from(content)
      .innerJoin(projects, eq(content.projectId, projects.id))
      .where(eq(content.id, id));

    return rows[0];
  }

  async create(
    data: Omit<NewContent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ContentWithProject> {
    const now = new Date().toISOString();
    const record: NewContent = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    await db.insert(content).values(record);

    return (await this.findById(record.id))!;
  }

  async update(
    id: string,
    data: Partial<Omit<NewContent, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ContentWithProject | undefined> {
    await db
      .update(content)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(content.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.delete(content).where(eq(content.id, id));
  }
}
