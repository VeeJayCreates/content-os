import {
  ResearchFactStatus,
  ResearchVerificationStatus,
  type ResearchVerification,
} from '@content-os/contracts';

export type VerificationEvidence = {
  signalId: string;
  researchSourceId: string;
};

export type VerificationFact = {
  status: ResearchFactStatus | string;
};

/**
 * Deterministic evidence quality policy. Distinct configured source identities
 * are conservative proxies for independence; they do not prove independent
 * journalism or source authority.
 */
export function evaluateResearchVerification(input: {
  signals: VerificationEvidence[];
  candidateClaimCount: number;
  facts: VerificationFact[];
}): ResearchVerification {
  const signals = distinctBy(input.signals, (signal) => signal.signalId);
  const distinctSourceCount = new Set(
    signals.map((signal) => signal.researchSourceId),
  ).size;
  const contradictionCount = input.facts.filter(
    (fact) => fact.status === ResearchFactStatus.CONFLICTING,
  ).length;

  if (contradictionCount > 0) {
    return result(
      ResearchVerificationStatus.CONFLICTING,
      signals.length,
      distinctSourceCount,
      input.candidateClaimCount,
      contradictionCount,
      [
        `${contradictionCount} evidence-backed claim(s) are explicitly marked conflicting.`,
        'Human review is required before automatic production.',
      ],
      false,
    );
  }
  if (signals.length === 0) {
    return result(
      ResearchVerificationStatus.INSUFFICIENT,
      0,
      0,
      input.candidateClaimCount,
      0,
      ['No usable evidence signals are available for this topic.'],
      false,
    );
  }
  if (distinctSourceCount < 2) {
    return result(
      ResearchVerificationStatus.SINGLE_SOURCE,
      signals.length,
      distinctSourceCount,
      input.candidateClaimCount,
      0,
      [
        'Evidence is limited to one configured Research Source identity.',
        'Distinct configured sources are not proof of editorial independence.',
      ],
      false,
    );
  }
  return result(
    ResearchVerificationStatus.CORROBORATED,
    signals.length,
    distinctSourceCount,
    input.candidateClaimCount,
    0,
    [
      `Evidence spans ${distinctSourceCount} distinct configured Research Source identities.`,
      'Configured-source diversity is not proof of editorial independence.',
    ],
    true,
  );
}

function result(
  verificationStatus: ResearchVerificationStatus,
  evidenceSignalCount: number,
  distinctSourceCount: number,
  candidateClaimCount: number,
  contradictionCount: number,
  verificationReasons: string[],
  canProceedAutomatically: boolean,
): ResearchVerification {
  return {
    verificationStatus,
    evidenceSignalCount,
    distinctSourceCount,
    independentSourceCount: distinctSourceCount,
    candidateClaimCount,
    contradictionCount,
    verificationReasons,
    canProceedAutomatically,
  };
}

function distinctBy<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}
