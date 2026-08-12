import { createHash } from 'node:crypto';

import { and, count, eq, inArray } from 'drizzle-orm';

import { db } from '../db.js';
import { opportunities } from '../schema/opportunity.js';
import { opportunityTopicCandidates, topicCandidates, type NewTopicCandidate, type TopicCandidate } from '../schema/topic-candidate.js';
import { researchSources } from '../schema/research-source.js';
import { signals } from '../schema/signal.js';

export class TopicCandidateProjectMismatchError extends Error {}

export type OpportunityTopicCandidate = TopicCandidate & {
  signal: typeof signals.$inferSelect;
  sourceName: string;
  sourceId: string;
};

export type CandidateContributionCounts = {
  candidateCount: number;
  signalCount: number;
  sourceCount: number;
};

export class TopicCandidateRepository {
  async upsert(data: {
    projectId: string;
    signalId: string;
    text: string;
    normalizedText: string;
  }): Promise<TopicCandidate> {
    const signal = await this.findSignalProject(data.signalId);
    if (!signal) throw new Error('Signal not found');
    if (signal.projectId !== data.projectId) throw new TopicCandidateProjectMismatchError('Topic candidate and Signal must belong to the same project');
    const candidateHash = candidateHashFor(data.normalizedText);
    const id = candidateIdFor(data.projectId, data.signalId, candidateHash);
    const now = new Date().toISOString();
    const record: NewTopicCandidate = { id, candidateHash, createdAt: now, updatedAt: now, ...data };
    await db.insert(topicCandidates).values(record).onConflictDoUpdate({
      target: [topicCandidates.projectId, topicCandidates.signalId, topicCandidates.candidateHash],
      set: { text: data.text, normalizedText: data.normalizedText, updatedAt: now },
    });
    const stored = await this.findByProjectSignalHash(data.projectId, data.signalId, candidateHash);
    if (!stored) throw new Error('Unable to persist topic candidate');
    return stored;
  }

  async attachToOpportunity(opportunityId: string, topicCandidateId: string): Promise<boolean> {
    const [opportunity, candidate] = await Promise.all([
      this.findOpportunityProject(opportunityId),
      this.findById(topicCandidateId),
    ]);
    if (!opportunity || !candidate) throw new Error('Opportunity or topic candidate not found');
    if (opportunity.projectId !== candidate.projectId) throw new TopicCandidateProjectMismatchError('Topic candidate and opportunity must belong to the same project');
    const rows = await db.insert(opportunityTopicCandidates).values({ opportunityId, topicCandidateId, createdAt: new Date().toISOString() }).onConflictDoNothing().returning({ topicCandidateId: opportunityTopicCandidates.topicCandidateId });
    return rows.length > 0;
  }

  async findByOpportunityIds(opportunityIds: string[]): Promise<Map<string, OpportunityTopicCandidate[]>> {
    const grouped = new Map<string, OpportunityTopicCandidate[]>();
    if (opportunityIds.length === 0) return grouped;
    const rows = await db.select({ opportunityId: opportunityTopicCandidates.opportunityId, candidate: topicCandidates, signal: signals, sourceId: researchSources.id, sourceName: researchSources.name }).from(opportunityTopicCandidates).innerJoin(topicCandidates, eq(opportunityTopicCandidates.topicCandidateId, topicCandidates.id)).innerJoin(signals, eq(topicCandidates.signalId, signals.id)).innerJoin(researchSources, eq(signals.researchSourceId, researchSources.id)).where(inArray(opportunityTopicCandidates.opportunityId, opportunityIds));
    for (const row of rows) grouped.set(row.opportunityId, [...(grouped.get(row.opportunityId) ?? []), { ...row.candidate, signal: row.signal, sourceId: row.sourceId, sourceName: row.sourceName }]);
    return grouped;
  }

  async membershipCountsByOpportunityIds(opportunityIds: string[]): Promise<Map<string, number>> {
    if (opportunityIds.length === 0) return new Map();
    const rows = await db
      .select({ opportunityId: opportunityTopicCandidates.opportunityId, membershipCount: count() })
      .from(opportunityTopicCandidates)
      .where(inArray(opportunityTopicCandidates.opportunityId, opportunityIds))
      .groupBy(opportunityTopicCandidates.opportunityId);
    return new Map(rows.map((row) => [row.opportunityId, row.membershipCount]));
  }

  async contributionCountsByOpportunityIds(opportunityIds: string[]): Promise<Map<string, CandidateContributionCounts>> {
    const candidatesByOpportunity = await this.findByOpportunityIds(opportunityIds);
    return new Map([...candidatesByOpportunity.entries()].map(([opportunityId, candidates]) => [opportunityId, {
      candidateCount: candidates.length,
      signalCount: new Set(candidates.map((candidate) => candidate.signalId)).size,
      sourceCount: new Set(candidates.map((candidate) => candidate.sourceId)).size,
    }]));
  }

  private async findById(id: string): Promise<TopicCandidate | undefined> {
    return (await db.select().from(topicCandidates).where(eq(topicCandidates.id, id)))[0];
  }

  private async findByProjectSignalHash(projectId: string, signalId: string, candidateHash: string): Promise<TopicCandidate | undefined> {
    return (await db.select().from(topicCandidates).where(and(eq(topicCandidates.projectId, projectId), eq(topicCandidates.signalId, signalId), eq(topicCandidates.candidateHash, candidateHash))))[0];
  }

  private async findOpportunityProject(id: string): Promise<{ projectId: string } | undefined> {
    return (await db.select({ projectId: opportunities.projectId }).from(opportunities).where(eq(opportunities.id, id)))[0];
  }

  private async findSignalProject(id: string): Promise<{ projectId: string } | undefined> {
    return (await db.select({ projectId: signals.projectId }).from(signals).where(eq(signals.id, id)))[0];
  }
}

export function candidateHashFor(normalizedText: string): string {
  return createHash('sha256').update(normalizedText).digest('hex');
}

export function candidateIdFor(projectId: string, signalId: string, candidateHash: string): string {
  return createHash('sha256').update(`${projectId}:${signalId}:${candidateHash}`).digest('hex');
}
