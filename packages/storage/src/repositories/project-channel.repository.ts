import { randomUUID } from 'node:crypto';

import { asc, eq } from 'drizzle-orm';

import { db } from '../db.js';
import {
  contentChannels,
  NewContentChannel,
  NewProductProfile,
  productProfiles,
} from '../schema/project-channel.js';

export class ProjectChannelRepository {
  async findProductProfileByProjectId(projectId: string) {
    const rows = await db
      .select()
      .from(productProfiles)
      .where(eq(productProfiles.projectId, projectId));

    return rows[0];
  }

  async findContentChannelsByProjectId(projectId: string) {
    return db
      .select()
      .from(contentChannels)
      .where(eq(contentChannels.projectId, projectId))
      .orderBy(asc(contentChannels.name));
  }

  async createProductProfile(
    data: Omit<NewProductProfile, 'createdAt' | 'updatedAt'>,
  ) {
    const now = new Date().toISOString();
    await db
      .insert(productProfiles)
      .values({ ...data, createdAt: now, updatedAt: now })
      .onConflictDoNothing();

    return this.findProductProfileByProjectId(data.projectId);
  }

  async createContentChannel(
    data: Omit<NewContentChannel, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    const now = new Date().toISOString();
    const channel = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
    await db.insert(contentChannels).values(channel).onConflictDoNothing();

    const channels = await this.findContentChannelsByProjectId(data.projectId);
    return channels.find((item) => item.slug === data.slug);
  }

  async updateProductProfileName(projectId: string, name: string) {
    await db
      .update(productProfiles)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(productProfiles.projectId, projectId));

    return this.findProductProfileByProjectId(projectId);
  }
}
