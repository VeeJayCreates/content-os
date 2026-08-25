import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { SemanticTopicClusteringService } from './semantic-topic-clustering.service';
import { ExternalResearchDiscoveryService } from './external-research-discovery.service';
import {
  ResearchSourceRole,
  ResearchSourceType,
  ResearchVerificationStatus,
  type ResearchExpansionResult,
  type ResearchPackageDetail,
  type ResearchVerification,
} from '@content-os/contracts';
import {
  OpportunityRepository,
  ResearchExpansionRepository,
  ResearchPackageRepository,
  ResearchSourceRepository,
  SignalRepository,
  TopicCandidateRepository,
} from '@content-os/storage';
import { IngestionService } from './ingestion.service';
import { ResearchPackageService } from './research-package.service';
import { OpportunityEvidenceService } from './opportunity-evidence.service';
import { extractTopicCandidates } from './topic-candidate-extraction';
import { normalizeClaimKey } from './research-package';
import { evaluateResearchVerification } from './research-verification';

const MAX_ATTEMPTS = 2;
const MAX_SOURCES_PER_ATTEMPT = 6;
const MAX_NEW_EVIDENCE = 8;

/**
 * Bounded, topic-local refresh of configured RSS verification sources. There
 * is intentionally no search-provider substitute: only exact candidate claims
 * extracted from newly ingested source content may join a semantic Topic.
 */
@Injectable()
export class ResearchExpansionService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly sources: ResearchSourceRepository,
    private readonly signals: SignalRepository,
    private readonly candidates: TopicCandidateRepository,
    private readonly expansions: ResearchExpansionRepository,
    private readonly packageRecords: ResearchPackageRepository,
    private readonly ingestion: IngestionService,
    private readonly packages: ResearchPackageService,
    private readonly evidence: OpportunityEvidenceService,
    private readonly semanticClustering: SemanticTopicClusteringService,
    private readonly externalDiscovery: ExternalResearchDiscoveryService,
  ) {}

  private async findSemanticMatches(
    projectId: string,
    claims: string[],
    candidates: Array<{ text: string; normalizedText: string }>,
  ) {
    if (!claims.length || !candidates.length) return [];

    const claimInputs = claims.map((claim, index) => ({
      id: `claim:${index}`,
      projectId,
      text: claim,
      normalizedText: claim,
    }));

    const candidateInputs = candidates.map((candidate, index) => ({
      id: `candidate:${index}`,
      projectId,
      text: candidate.text,
      normalizedText: candidate.normalizedText,
    }));

    const clusters = await this.semanticClustering.cluster([
      ...claimInputs,
      ...candidateInputs,
    ]);

    const matchedCandidateIds = new Set<string>();

    for (const cluster of clusters) {
      const containsClaim = cluster.candidateIds.some((id) =>
        id.startsWith('claim:'),
      );

      if (!containsClaim) continue;

      for (const id of cluster.candidateIds) {
        if (id.startsWith('candidate:')) {
          matchedCandidateIds.add(id);
        }
      }
    }

    return candidates.filter((_, index) =>
      matchedCandidateIds.has(`candidate:${index}`),
    );
  }

  async expand(opportunityId: string): Promise<ResearchExpansionResult> {
    const startedAt = Date.now();
    const opportunity = await this.opportunities.findById(opportunityId);
    if (!opportunity) throw new NotFoundException('Opportunity not found');

    const context = await this.initialContext(opportunityId, opportunity.title);
    let current = context.researchPackage;
    const initial = context.verification;
    if (initial.verificationStatus === ResearchVerificationStatus.CORROBORATED || initial.verificationStatus === ResearchVerificationStatus.CONFLICTING) {
      return this.result(opportunityId, 'skipped', initial, startedAt, { warnings: [`Topic is already ${initial.verificationStatus}.`] });
    }

    const existingSourceIds = context.existingSourceIds;
    const claims = context.claims;
    if (!claims.length) {
      return this.result(opportunityId, 'exhausted', initial, startedAt, {
        warnings: ['Topic has insufficient deterministic identity for research expansion.'],
      });
    }
    const sources = (await this.sources.findAll(opportunity.projectId))
      .filter((source) => source.enabled)
      .filter(
        (source) =>
          source.sourceType === ResearchSourceType.RSS ||
          source.sourceType === ResearchSourceType.YOUTUBE,
      )
      .filter((source) => source.role === ResearchSourceRole.VERIFICATION || source.role === ResearchSourceRole.BOTH)
      .filter((source) => !existingSourceIds.has(source.id))
      .slice(0, MAX_SOURCES_PER_ATTEMPT);
    const inputHash = hash({ claims, sources: sources.map((source) => source.id) });
    const state = await this.expansions.findByOpportunityId(opportunityId);
    if (state?.inputHash === inputHash && state.attemptCount >= MAX_ATTEMPTS) {
      return this.result(opportunityId, 'exhausted', initial, startedAt, { queriesPlanned: claims.length, queriesSkipped: claims.length, warnings: ['Expansion attempts are exhausted for unchanged topic evidence.'] });
    }

    let signalsDiscovered = 0;
    let accepted = 0;
    let duplicates = 0;
    let providerFailures = 0;
    const warnings: string[] = [];
    for (const source of sources) {
      try {
        const ingestion = await this.ingestion.ingest(source.id);
        signalsDiscovered += ingestion.createdCount;
        const sourceSignals = await this.signals.findAll(opportunity.projectId, source.id);
        for (const signal of sourceSignals) {
          if (accepted >= MAX_NEW_EVIDENCE) break;
          const extracted = extractTopicCandidates(signal.title);

          const exactMatches = extracted.filter((candidate) =>
            claims.includes(candidate.normalizedText),
          );

          const unmatched = extracted.filter(
            (candidate) => !claims.includes(candidate.normalizedText),
          );

          const semanticMatches =
            unmatched.length > 0
              ? await this.findSemanticMatches(
                  opportunity.projectId,
                  claims,
                  unmatched,
                )
              : [];

          const acceptedCandidates = [
            ...exactMatches,
            ...semanticMatches,
          ];

          for (const candidate of acceptedCandidates) {
            if (accepted >= MAX_NEW_EVIDENCE) break;

            const stored = await this.candidates.upsert({
              projectId: opportunity.projectId,
              signalId: signal.id,
              ...candidate,
            });

            if (
              await this.candidates.attachToOpportunity(
                opportunityId,
                stored.id,
              )
            ) {
              accepted += 1;
            } else {
              duplicates += 1;
            }
          }
        }
      } catch {
        providerFailures += 1;
        warnings.push(`Configured source '${source.name}' could not be refreshed.`);
      }
    }
    if (accepted === 0) {
      const discovery = await this.externalDiscovery.discover({
        projectId: opportunity.projectId,
        queries: claims.slice(0, 3),
      });

      if (discovery.acceptedResults > 0) {
        const discoveredSignals = await this.signals.findAll(opportunity.projectId);

        const discoveredByUrl = new Map(
          discovery.results.map((result) => [result.url, result]),
        );

        for (const signal of discoveredSignals) {
          if (accepted >= MAX_NEW_EVIDENCE) break;
          if (!discoveredByUrl.has(signal.url)) continue;

          const extracted = extractTopicCandidates(signal.title);

          const exactMatches = extracted.filter((candidate) =>
            claims.includes(candidate.normalizedText),
          );

          const unmatched = extracted.filter(
            (candidate) => !claims.includes(candidate.normalizedText),
          );

          const semanticMatches =
            unmatched.length > 0
              ? await this.findSemanticMatches(
                  opportunity.projectId,
                  claims,
                  unmatched,
                )
              : [];

          const acceptedCandidates = [
            ...exactMatches,
            ...semanticMatches,
          ];

          for (const candidate of acceptedCandidates) {
            if (accepted >= MAX_NEW_EVIDENCE) break;

            const stored = await this.candidates.upsert({
              projectId: opportunity.projectId,
              signalId: signal.id,
              ...candidate,
            });

            if (
              await this.candidates.attachToOpportunity(
                opportunityId,
                stored.id,
              )
            ) {
              accepted += 1;
            } else {
              duplicates += 1;
            }
          }
        }
      }
    }
    if (accepted > 0 || duplicates > 0) {
      current = await this.ensurePackage(opportunityId);
    }
    const verification = current?.verification ?? initial;
    const status = verification.verificationStatus === ResearchVerificationStatus.CORROBORATED ? 'expanded' : 'exhausted';
    await this.expansions.upsert({
      opportunityId,
      inputHash,
      attemptCount: state?.inputHash === inputHash ? state.attemptCount + 1 : 1,
      lastStatus: status,
      lastRunAt: new Date().toISOString(),
    });
    return this.result(opportunityId, status, verification, startedAt, {
      queriesPlanned: claims.length,
      queriesSkipped: 0,
      sourcesSearched: sources.length,
      signalsDiscovered,
      candidateEvidenceAccepted: accepted,
      duplicateEvidenceRejected: duplicates,
      providerFailures,
      warnings: sources.length === 0 ? [...warnings, 'No distinct configured RSS verification sources are available.'] : warnings,
    });
  }

  private async ensurePackage(opportunityId: string): Promise<ResearchPackageDetail> {
    const generated = await this.packages.generate(opportunityId);
    return this.packages.findOne(generated.packageId);
  }

  private async initialContext(opportunityId: string, opportunityTitle: string): Promise<{
    researchPackage: ResearchPackageDetail | undefined;
    verification: ResearchVerification;
    claims: string[];
    existingSourceIds: Set<string>;
  }> {
    const existing = await this.packageRecords.findByOpportunityId(opportunityId);
    if (existing) {
      const researchPackage = await this.packages.findOne(existing.id);
      return {
        researchPackage,
        verification: researchPackage.verification,
        claims: [...new Set(researchPackage.facts.map((fact) => normalizeClaimKey(fact.claim)).filter(Boolean))],
        existingSourceIds: new Set(researchPackage.signals.map((signal) => signal.researchSourceId)),
      };
    }

    const resolved = await this.evidence.resolveOpportunityEvidence(opportunityId);
    const claims = resolved.kind === 'candidate'
      ? [...new Set(resolved.candidates.map((candidate) => normalizeClaimKey(candidate.candidateText)).filter(Boolean))]
      : [normalizeClaimKey(opportunityTitle)].filter(Boolean);
    const signals = resolved.signals.map((signal) => ({
      signalId: signal.id,
      researchSourceId: signal.researchSourceId,
    }));
    return {
      researchPackage: undefined,
      verification: evaluateResearchVerification({
        signals,
        candidateClaimCount: claims.length,
        facts: [],
      }),
      claims,
      existingSourceIds: new Set(signals.map((signal) => signal.researchSourceId)),
    };
  }

  private result(opportunityId: string, status: ResearchExpansionResult['status'], verification: ResearchPackageDetail['verification'], startedAt: number, values: Partial<Omit<ResearchExpansionResult, 'opportunityId' | 'status' | 'verification' | 'runtimeMs' | 'warnings'>> & { warnings?: string[] }): ResearchExpansionResult {
    return { opportunityId, status, queriesPlanned: 0, queriesSkipped: 0, sourcesSearched: 0, signalsDiscovered: 0, candidateEvidenceAccepted: 0, duplicateEvidenceRejected: 0, providerFailures: 0, warnings: [], ...values, verification, runtimeMs: Date.now() - startedAt };
  }
}
function hash(value: object): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
