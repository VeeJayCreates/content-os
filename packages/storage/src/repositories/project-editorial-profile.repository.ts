import { eq } from 'drizzle-orm';

import { db } from '../db.js';
import {
  NewProjectEditorialProfile,
  ProjectEditorialProfile,
  projectEditorialProfiles,
} from '../schema/project-editorial-profile.js';

export const defaultProjectEditorialProfile = {
  mission: '',
  targetAudience: '',
  primaryLanguage: '',
  primaryGeography: '',
  topicThemes: [] as string[],
  excludedTopics: [] as string[],
  contentGoals: [] as string[],
  preferredFormats: [] as string[],
  timelinessPreference: 'balanced',
} as const;

export type ProjectEditorialProfileUpdate = Partial<
  Pick<
    NewProjectEditorialProfile,
    | 'mission'
    | 'targetAudience'
    | 'primaryLanguage'
    | 'primaryGeography'
    | 'topicThemes'
    | 'excludedTopics'
    | 'contentGoals'
    | 'preferredFormats'
    | 'timelinessPreference'
  >
>;

export class ProjectEditorialProfileRepository {
  async findByProjectId(
    projectId: string,
  ): Promise<ProjectEditorialProfile | undefined> {
    const rows = await db
      .select()
      .from(projectEditorialProfiles)
      .where(eq(projectEditorialProfiles.projectId, projectId));

    return rows[0];
  }

  async getOrCreateDefault(projectId: string): Promise<ProjectEditorialProfile> {
    const now = new Date().toISOString();
    await db
      .insert(projectEditorialProfiles)
      .values({
        projectId,
        ...defaultProjectEditorialProfile,
        topicThemes: [],
        excludedTopics: [],
        contentGoals: [],
        preferredFormats: [],
        revision: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    const profile = await this.findByProjectId(projectId);
    if (!profile) {
      throw new Error('Unable to load the project editorial profile');
    }
    return profile;
  }

  async update(
    projectId: string,
    update: ProjectEditorialProfileUpdate,
  ): Promise<ProjectEditorialProfile> {
    const current = await this.getOrCreateDefault(projectId);
    const now = new Date().toISOString();

    await db
      .update(projectEditorialProfiles)
      .set({ ...update, revision: current.revision + 1, updatedAt: now })
      .where(eq(projectEditorialProfiles.projectId, projectId));

    const profile = await this.findByProjectId(projectId);
    if (!profile) {
      throw new Error('Unable to update the project editorial profile');
    }
    return profile;
  }
}
