import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { researchExpansionStates, type ResearchExpansionState } from '../schema/research-expansion.js';

export class ResearchExpansionRepository {
  async findByOpportunityId(opportunityId: string): Promise<ResearchExpansionState | undefined> {
    return (await db.select().from(researchExpansionStates).where(eq(researchExpansionStates.opportunityId, opportunityId)))[0];
  }
  async upsert(data: Pick<ResearchExpansionState, 'opportunityId' | 'inputHash' | 'attemptCount' | 'lastStatus' | 'lastRunAt'>): Promise<void> {
    const now = new Date().toISOString();
    await db.insert(researchExpansionStates).values({ id: randomUUID(), ...data, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: researchExpansionStates.opportunityId, set: { ...data, updatedAt: now } });
  }
}
