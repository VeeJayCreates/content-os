import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ResearchEvidence,
  ResearchFact,
  ResearchPackage,
  ResearchPackageDetail,
  ResearchPackageGenerationResult,
  ResearchPackageStatus,
} from '@content-os/contracts';
import {
  OpportunityRepository,
  ResearchFactWithEvidence,
  ResearchPackageRepository,
  ResearchPackageWithContext,
} from '@content-os/storage';

import {
  factStatusForSources,
  normalizeClaimKey,
  scoreResearchConfidence,
  summarizeResearchPackage,
} from './research-package';

@Injectable()
export class ResearchPackageService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly packages: ResearchPackageRepository,
  ) {}

  async generate(
    opportunityId: string,
  ): Promise<ResearchPackageGenerationResult> {
    const opportunity = await this.opportunities.findById(opportunityId);
    if (!opportunity) throw new NotFoundException('Opportunity not found');

    const signals =
      (
        await this.opportunities.findSignalsByOpportunityIds([opportunityId])
      ).get(opportunityId) ?? [];
    if (!signals.length)
      throw new ConflictException('Opportunity has no supporting signals');

    const sourceCount = new Set(
      signals.map((signal) => signal.researchSourceId),
    ).size;
    const confidenceScore = scoreResearchConfidence(signals);
    const packageData = {
      title: opportunity.title,
      summary: summarizeResearchPackage(
        opportunity.title,
        opportunity.summary,
        signals,
      ),
      status: 'ready',
      confidenceScore,
      sourceCount,
      signalCount: signals.length,
    } as const;

    let researchPackage =
      await this.packages.findByOpportunityId(opportunityId);
    if (researchPackage) {
      researchPackage = (await this.packages.update(
        researchPackage.id,
        packageData,
      ))!;
    } else {
      researchPackage = await this.packages.create({
        projectId: opportunity.projectId,
        opportunityId,
        ...packageData,
      });
    }

    const factResult = await this.packages.upsertFact({
      researchPackageId: researchPackage.id,
      claim: opportunity.title,
      normalizedClaimKey: normalizeClaimKey(opportunity.title),
      confidence: confidenceScore,
      status: factStatusForSources(sourceCount),
    });

    for (const signal of signals)
      await this.packages.attachEvidence(factResult.fact.id, signal.id);

    return {
      packageId: researchPackage.id,
      signalsProcessed: signals.length,
      sourcesUsed: sourceCount,
      factsCreated: factResult.created ? 1 : 0,
      factsUpdated: factResult.created ? 0 : 1,
      confidenceScore,
      warnings:
        sourceCount < 2
          ? ['Only one independent source supports this package.']
          : [],
    };
  }

  async findAll(projectId?: string): Promise<ResearchPackage[]> {
    return (await this.packages.findAll(projectId)).map((researchPackage) =>
      this.toPackage(researchPackage),
    );
  }

  async findOne(id: string): Promise<ResearchPackageDetail> {
    const researchPackage = await this.packages.findById(id);
    if (!researchPackage)
      throw new NotFoundException('Research package not found');

    const rows =
      (await this.packages.findFactsWithEvidenceByPackageIds([id])).get(id) ??
      [];
    return {
      ...this.toPackage(researchPackage),
      ...this.toFactsAndSignals(rows),
    };
  }

  private toPackage(record: ResearchPackageWithContext): ResearchPackage {
    return {
      id: record.id,
      projectId: record.projectId,
      opportunityId: record.opportunityId,
      project: { id: record.projectId, name: record.projectName },
      opportunityTitle: record.opportunityTitle,
      title: record.title,
      summary: record.summary,
      status: record.status as ResearchPackageStatus,
      confidenceScore: record.confidenceScore,
      sourceCount: record.sourceCount,
      signalCount: record.signalCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toFactsAndSignals(
    rows: ResearchFactWithEvidence[],
  ): Pick<ResearchPackageDetail, 'facts' | 'signals'> {
    const facts = new Map<string, ResearchFact>();
    const signals = new Map<string, ResearchEvidence>();
    for (const row of rows) {
      let fact = facts.get(row.id);
      if (!fact) {
        fact = {
          id: row.id,
          claim: row.claim,
          confidence: row.confidence,
          status: row.status as ResearchFact['status'],
          evidence: [],
          createdAt: row.createdAt,
        };
        facts.set(row.id, fact);
      }
      if (
        !row.signalId ||
        !row.signalTitle ||
        !row.signalUrl ||
        !row.sourceName ||
        !row.signalDiscoveredAt
      )
        continue;
      const evidence = {
        signalId: row.signalId,
        title: row.signalTitle,
        url: row.signalUrl,
        summary: row.signalSummary,
        sourceName: row.sourceName,
        publishedAt: row.signalPublishedAt,
        discoveredAt: row.signalDiscoveredAt,
      };
      fact.evidence.push(evidence);
      signals.set(evidence.signalId, evidence);
    }
    return { facts: [...facts.values()], signals: [...signals.values()] };
  }
}
