import { Injectable } from '@nestjs/common';
import {
  OpportunityRepository,
  OpportunitySignal,
  TopicCandidateRepository,
} from '@content-os/storage';

export class OpportunityEvidenceResolutionError extends Error {
  constructor(
    readonly category: 'candidate_parent_data_missing',
  ) {
    super('Opportunity candidate evidence is incomplete');
  }
}

export type CandidateOpportunityEvidence = {
  candidateId: string;
  candidateText: string;
  signal: OpportunitySignal;
};

export type ResolvedOpportunityEvidence =
  | {
      kind: 'candidate';
      candidates: CandidateOpportunityEvidence[];
      signals: OpportunitySignal[];
    }
  | {
      kind: 'legacy';
      candidates: [];
      signals: OpportunitySignal[];
    };

/**
 * Candidate memberships are the semantic authority for V2 Topics.
 * Legacy opportunity_signals remain valid supporting evidence and are
 * merged with candidate-backed Signals after candidate integrity is verified.
 */
@Injectable()
export class OpportunityEvidenceService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly candidates: TopicCandidateRepository,
  ) {}

  async resolveOpportunityEvidence(
    opportunityId: string,
  ): Promise<ResolvedOpportunityEvidence> {
    const [membershipCounts, candidatesByOpportunity] = await Promise.all([
      this.candidates.membershipCountsByOpportunityIds([opportunityId]),
      this.candidates.findByOpportunityIds([opportunityId]),
    ]);
    const membershipCount = membershipCounts.get(opportunityId) ?? 0;
    const candidates = candidatesByOpportunity.get(opportunityId) ?? [];

    if (membershipCount > 0) {
      if (candidates.length !== membershipCount) {
        throw new OpportunityEvidenceResolutionError(
          'candidate_parent_data_missing',
        );
      }

      const evidence = candidates.map((candidate) => ({
        candidateId: candidate.id,
        candidateText: candidate.text,
        signal: { ...candidate.signal, sourceName: candidate.sourceName },
      }));

      const legacySignals =
        (
          await this.opportunities.findSignalsByOpportunityIds([opportunityId])
        ).get(opportunityId) ?? [];

      return {
        kind: 'candidate',
        candidates: evidence,
        signals: distinctSignals([
          ...legacySignals,
          ...evidence.map((item) => item.signal),
        ]),
      };
    }

    const signals =
      (await this.opportunities.findSignalsByOpportunityIds([opportunityId])).get(
        opportunityId,
      ) ?? [];
    return { kind: 'legacy', candidates: [], signals };
  }
}

function distinctSignals(signals: OpportunitySignal[]): OpportunitySignal[] {
  return [...new Map(signals.map((signal) => [signal.id, signal])).values()];
}
