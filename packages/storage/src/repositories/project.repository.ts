import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { db } from '../db.js';
import {
  NewProject,
  Project,
  projects,
} from '../schema/project.js';

export class ProjectRepository {
  async findAll(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async findById(id: string): Promise<Project | undefined> {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    return rows[0];
  }

  async create(
	data: Omit<NewProject, 'id' | 'createdAt' | 'updatedAt'>,
	): Promise<Project> {
	  const now = new Date().toISOString();

	  const project: NewProject = {
		id: randomUUID(),
		createdAt: now,
		updatedAt: now,
		description: data.description ?? null,
		...data,
	  };

	  await db.insert(projects).values(project);

	  return (await this.findById(project.id))!;
	}

  async delete(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }
}