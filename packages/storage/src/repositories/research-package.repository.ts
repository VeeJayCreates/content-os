import { randomUUID } from "node:crypto";

import { desc, eq, getTableColumns, inArray } from "drizzle-orm";

import { db } from "../db.js";
import { opportunities } from "../schema/opportunity.js";
import {
  NewResearchFact,
  NewResearchPackage,
  ResearchFact,
  researchFactEvidence,
  researchFacts,
  researchPackages,
} from "../schema/research-package.js";
import { projects } from "../schema/project.js";
import { researchSources } from "../schema/research-source.js";
import { signals } from "../schema/signal.js";

const packageColumns = getTableColumns(researchPackages);

export type ResearchPackageWithContext =
  typeof researchPackages.$inferSelect & {
    projectName: string;
    opportunityTitle: string;
  };

export type ResearchFactWithEvidence = typeof researchFacts.$inferSelect & {
  signalId: string | null;
  researchSourceId: string | null;
  signalTitle: string | null;
  signalUrl: string | null;
  signalSummary: string | null;
  signalPublishedAt: string | null;
  signalDiscoveredAt: string | null;
  sourceName: string | null;
};

export type ResearchFactReplacement = {
  claim: string;
  normalizedClaimKey: string;
  confidence: number;
  status: string;
  signalIds: string[];
  geographicEntities?: unknown[];
};

export class ResearchPackageRepository {
  async setFactGeographicEntities(factId: string, geographicEntities: unknown[]) {
    await db.update(researchFacts).set({ geographicEntities }).where(eq(researchFacts.id, factId));
  }
  async findAll(projectId?: string): Promise<ResearchPackageWithContext[]> {
    const query = db
      .select({
        ...packageColumns,
        projectName: projects.name,
        opportunityTitle: opportunities.title,
      })
      .from(researchPackages)
      .innerJoin(projects, eq(researchPackages.projectId, projects.id))
      .innerJoin(
        opportunities,
        eq(researchPackages.opportunityId, opportunities.id),
      );
    return projectId
      ? query
          .where(eq(researchPackages.projectId, projectId))
          .orderBy(desc(researchPackages.updatedAt))
      : query.orderBy(desc(researchPackages.updatedAt));
  }

  async findById(id: string): Promise<ResearchPackageWithContext | undefined> {
    const rows = await db
      .select({
        ...packageColumns,
        projectName: projects.name,
        opportunityTitle: opportunities.title,
      })
      .from(researchPackages)
      .innerJoin(projects, eq(researchPackages.projectId, projects.id))
      .innerJoin(
        opportunities,
        eq(researchPackages.opportunityId, opportunities.id),
      )
      .where(eq(researchPackages.id, id));
    return rows[0];
  }

  async findByOpportunityId(
    opportunityId: string,
  ): Promise<ResearchPackageWithContext | undefined> {
    const rows = await db
      .select({
        ...packageColumns,
        projectName: projects.name,
        opportunityTitle: opportunities.title,
      })
      .from(researchPackages)
      .innerJoin(projects, eq(researchPackages.projectId, projects.id))
      .innerJoin(
        opportunities,
        eq(researchPackages.opportunityId, opportunities.id),
      )
      .where(eq(researchPackages.opportunityId, opportunityId));
    return rows[0];
  }

  async create(
    data: Omit<NewResearchPackage, "id" | "createdAt" | "updatedAt">,
  ): Promise<ResearchPackageWithContext> {
    const now = new Date().toISOString();
    const record: NewResearchPackage = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    await db.insert(researchPackages).values(record);
    return (await this.findById(record.id))!;
  }

  async update(
    id: string,
    data: Partial<
      Omit<
        NewResearchPackage,
        "id" | "projectId" | "opportunityId" | "createdAt" | "updatedAt"
      >
    >,
  ): Promise<ResearchPackageWithContext | undefined> {
    await db
      .update(researchPackages)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(researchPackages.id, id));
    return this.findById(id);
  }

  async upsertFact(
    data: Omit<NewResearchFact, "id" | "createdAt">,
  ): Promise<{ fact: ResearchFact; created: boolean }> {
    const existing = await this.findFactByKey(
      data.researchPackageId,
      data.normalizedClaimKey,
    );
    if (existing) {
      await db
        .update(researchFacts)
        .set({
          claim: data.claim,
          confidence: data.confidence,
          status: data.status,
        })
        .where(eq(researchFacts.id, existing.id));
      return { fact: { ...existing, ...data, geographicEntities: data.geographicEntities ?? existing.geographicEntities ?? [] }, created: false };
    }
    const fact: NewResearchFact = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
      geographicEntities: data.geographicEntities ?? [],
    };
    await db.insert(researchFacts).values(fact);
    return { fact: { ...fact, geographicEntities: fact.geographicEntities ?? [] }, created: true };
  }

  async attachEvidence(
    researchFactId: string,
    signalId: string,
  ): Promise<boolean> {
    const rows = await db
      .insert(researchFactEvidence)
      .values({ researchFactId, signalId, createdAt: new Date().toISOString() })
      .onConflictDoNothing()
      .returning({ researchFactId: researchFactEvidence.researchFactId });
    return rows.length > 0;
  }

  /**
   * Candidate-backed package generation is a complete semantic rebuild. This
   * replaces its generated facts/evidence atomically so stale legacy or
   * sibling-candidate evidence cannot remain in the package.
   */
  async replaceFactsWithEvidence(
    researchPackageId: string,
    replacements: ResearchFactReplacement[],
  ): Promise<{ previousFactCount: number }> {
    const now = new Date().toISOString();
    return db.transaction((tx) => {
      const existingFacts = tx
        .select({ id: researchFacts.id })
        .from(researchFacts)
        .where(eq(researchFacts.researchPackageId, researchPackageId))
        .all();
      const factIds = existingFacts.map((fact) => fact.id);
      if (factIds.length > 0) {
        tx.delete(researchFactEvidence)
          .where(inArray(researchFactEvidence.researchFactId, factIds))
          .run();
      }
      tx.delete(researchFacts)
        .where(eq(researchFacts.researchPackageId, researchPackageId))
        .run();

      for (const replacement of replacements) {
        const factId = randomUUID();
        tx.insert(researchFacts)
          .values({
            id: factId,
            researchPackageId,
            claim: replacement.claim,
            normalizedClaimKey: replacement.normalizedClaimKey,
            confidence: replacement.confidence,
            status: replacement.status,
            geographicEntities: replacement.geographicEntities ?? [],
            createdAt: now,
          })
          .run();
        const signalIds = [...new Set(replacement.signalIds)];
        if (signalIds.length > 0) {
          tx.insert(researchFactEvidence)
            .values(
              signalIds.map((signalId) => ({
                researchFactId: factId,
                signalId,
                createdAt: now,
              })),
            )
            .run();
        }
      }
      return { previousFactCount: existingFacts.length };
    });
  }

  async findFactsWithEvidenceByPackageIds(
    ids: string[],
  ): Promise<Map<string, ResearchFactWithEvidence[]>> {
    const grouped = new Map<string, ResearchFactWithEvidence[]>();
    if (!ids.length) return grouped;
    const rows = await db
      .select({
        fact: researchFacts,
        signalId: signals.id,
        researchSourceId: signals.researchSourceId,
        signalTitle: signals.title,
        signalUrl: signals.url,
        signalSummary: signals.summary,
        signalPublishedAt: signals.publishedAt,
        signalDiscoveredAt: signals.discoveredAt,
        sourceName: researchSources.name,
      })
      .from(researchFacts)
      .leftJoin(
        researchFactEvidence,
        eq(researchFacts.id, researchFactEvidence.researchFactId),
      )
      .leftJoin(signals, eq(researchFactEvidence.signalId, signals.id))
      .leftJoin(
        researchSources,
        eq(signals.researchSourceId, researchSources.id),
      )
      .where(inArray(researchFacts.researchPackageId, ids));
    for (const row of rows)
      grouped.set(row.fact.researchPackageId, [
        ...(grouped.get(row.fact.researchPackageId) ?? []),
        {
          ...row.fact,
          signalId: row.signalId,
          researchSourceId: row.researchSourceId,
          signalTitle: row.signalTitle,
          signalUrl: row.signalUrl,
          signalSummary: row.signalSummary,
          signalPublishedAt: row.signalPublishedAt,
          signalDiscoveredAt: row.signalDiscoveredAt,
          sourceName: row.sourceName,
        },
      ]);
    return grouped;
  }


  private async findFactByKey(
    researchPackageId: string,
    normalizedClaimKey: string,
  ): Promise<ResearchFact | undefined> {
    const rows = await db
      .select()
      .from(researchFacts)
      .where(eq(researchFacts.researchPackageId, researchPackageId));
    return rows.find((fact) => fact.normalizedClaimKey === normalizedClaimKey);
  }
}
