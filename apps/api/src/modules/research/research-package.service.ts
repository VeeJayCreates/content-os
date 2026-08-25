import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ResearchEvidence,
  ResearchFact,
  ResearchPackage,
  ResearchPackageDetail,
  ResearchPackageGenerationResult,
  ResearchPackageStatus,
  ResearchVerification,
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
import {
  OpportunityEvidenceResolutionError,
  OpportunityEvidenceService,
  type ResolvedOpportunityEvidence,
} from './opportunity-evidence.service';
import { evaluateResearchVerification } from './research-verification';

@Injectable()
export class ResearchPackageService {
  private readonly logger = new Logger(ResearchPackageService.name);

  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly packages: ResearchPackageRepository,
    private readonly evidence: OpportunityEvidenceService,
  ) {}

  async generate(
    opportunityId: string,
  ): Promise<ResearchPackageGenerationResult> {
    const opportunity = await this.opportunities.findById(opportunityId);
    if (!opportunity) throw new NotFoundException('Opportunity not found');

    let resolvedEvidence: ResolvedOpportunityEvidence;
    try {
      resolvedEvidence = await this.evidence.resolveOpportunityEvidence(
        opportunityId,
      );
    } catch (error) {
      if (error instanceof OpportunityEvidenceResolutionError) {
        this.logger.warn(
          JSON.stringify({
            stage: 'research_package.evidence_resolution_failed',
            opportunityId,
            category: error.category,
          }),
        );
        throw new ConflictException('Opportunity evidence is unavailable');
      }
      throw error;
    }
    const signals = resolvedEvidence.signals;
    if (!signals.length)
      throw new ConflictException('Opportunity has no supporting signals');

    const sourceCount = new Set(
      signals.map((signal) => signal.researchSourceId),
    ).size;
    const candidateClaimCount =
      resolvedEvidence.kind === 'candidate'
        ? new Set(
            resolvedEvidence.candidates.map((candidate) =>
              normalizeClaimKey(candidate.candidateText),
            ),
          ).size
        : 1;
    const verification = evaluateResearchVerification({
      signals: signals.map((signal) => ({
        signalId: signal.id,
        researchSourceId: signal.researchSourceId,
      })),
      candidateClaimCount,
      facts: [],
    });
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

    let factsCreated = 0;
    let factsUpdated = 0;
    if (resolvedEvidence.kind === 'candidate') {
      const facts = new Map<
        string,
        { claim: string; normalizedClaimKey: string; signalIds: string[] }
      >();

      const candidateSignalIds = new Set(
        resolvedEvidence.candidates.map((candidate) => candidate.signal.id),
      );

      const signalSourceById = new Map(
        signals.map((signal) => [signal.id, signal.researchSourceId]),
      );

      // Candidate-backed facts retain only their actual candidate evidence.
      for (const candidate of resolvedEvidence.candidates) {
        const normalizedClaimKey = normalizeClaimKey(candidate.candidateText);
        const existing = facts.get(normalizedClaimKey);

        if (existing) {
          existing.signalIds.push(candidate.signal.id);
        } else {
          facts.set(normalizedClaimKey, {
            claim: candidate.candidateText,
            normalizedClaimKey,
            signalIds: [candidate.signal.id],
          });
        }
      }

      // Signals inherited from the legacy opportunity path support the original
      // opportunity claim. Do not attach them indiscriminately to candidate facts.
      const legacySignals = signals.filter(
        (signal) => !candidateSignalIds.has(signal.id),
      );

      if (legacySignals.length > 0) {
        const normalizedOpportunityKey = normalizeClaimKey(opportunity.title);
        const existing = facts.get(normalizedOpportunityKey);

        if (existing) {
          existing.signalIds.push(
            ...legacySignals.map((signal) => signal.id),
          );
        } else {
          facts.set(normalizedOpportunityKey, {
            claim: opportunity.title,
            normalizedClaimKey: normalizedOpportunityKey,
            signalIds: legacySignals.map((signal) => signal.id),
          });
        }
      }

      const replacements = [...facts.values()].map((fact) => {
        const factSourceCount = new Set(
          fact.signalIds
            .map((signalId) => signalSourceById.get(signalId))
            .filter((sourceId): sourceId is string => Boolean(sourceId)),
        ).size;

        return {
          ...fact,
          signalIds: [...new Set(fact.signalIds)],
          confidence: confidenceScore,
          status: factStatusForSources(factSourceCount),
        };
      });

      const replacement = await this.packages.replaceFactsWithEvidence(
        researchPackage.id,
        replacements,
      );

      if (replacement.previousFactCount > 0) {
        factsUpdated = replacements.length;
      } else {
        factsCreated = replacements.length;
      }
    } else {
      const fact = {
        claim: opportunity.title,
        signalIds: signals.map((signal) => signal.id),
      };
      const factResult = await this.packages.upsertFact({
        researchPackageId: researchPackage.id,
        claim: fact.claim,
        normalizedClaimKey: normalizeClaimKey(fact.claim),
        confidence: confidenceScore,
        status: factStatusForSources(sourceCount),
      });
      if (factResult.created) factsCreated += 1;
      else factsUpdated += 1;
      for (const signalId of fact.signalIds)
        await this.packages.attachEvidence(factResult.fact.id, signalId);
    }

    return {
      packageId: researchPackage.id,
      signalsProcessed: signals.length,
      sourcesUsed: sourceCount,
      factsCreated,
      factsUpdated,
      confidenceScore,
      verification,
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
    const factsAndSignals = this.toFactsAndSignals(rows);
    return {
      ...this.toPackage(researchPackage),
      ...factsAndSignals,
      verification: this.verificationFor(factsAndSignals),
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
        !row.researchSourceId ||
        !row.signalTitle ||
        !row.signalUrl ||
        !row.sourceName ||
        !row.signalDiscoveredAt
      )
        continue;
      const evidence = {
        signalId: row.signalId,
        researchSourceId: row.researchSourceId,
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

  private verificationFor(
    detail: Pick<ResearchPackageDetail, 'facts' | 'signals'>,
  ): ResearchVerification {
    return evaluateResearchVerification({
      signals: detail.signals.map((signal) => ({
        signalId: signal.signalId,
        researchSourceId: signal.researchSourceId,
      })),
      candidateClaimCount: detail.facts.length,
      facts: detail.facts,
    });
  }
}
