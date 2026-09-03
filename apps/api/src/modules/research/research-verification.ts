import {
  ResearchFactStatus,
  ResearchVerificationStatus,
  type ResearchVerification,
} from '@content-os/contracts';

export type VerificationEvidence = { signalId: string; researchSourceId: string };

/** One article, video, or document. Its chunks are never separate support. */
export type SupportingContent = { contentId: string; sourceIdentityId: string };

export type VerificationFact = { status: ResearchFactStatus | string };

export const MINIMUM_SUPPORTING_EVIDENCE = 3;
export const MINIMUM_DISTINCT_SOURCES = 3;

/**
 * Research quality is independent of editorial potential. A source identity
 * may be configured or legitimately discovered, but extraction records from
 * one underlying article/video always count as one supporting content.
 */
export function evaluateResearchVerification(input: {
  signals: VerificationEvidence[];
  supportingContents?: SupportingContent[];
  evidenceRecordCount?: number;
  candidateClaimCount: number;
  facts: VerificationFact[];
}): ResearchVerification {
  const signals = distinctBy(input.signals, (signal) => signal.signalId);
  const supportingContents = distinctBy(
    input.supportingContents ?? signals.map((signal) => ({ contentId: signal.signalId, sourceIdentityId: signal.researchSourceId })),
    (content) => content.contentId,
  );
  const distinctSourceCount = new Set(supportingContents.map((content) => content.sourceIdentityId)).size;
  const evidenceRecordCount = input.evidenceRecordCount ?? supportingContents.length;
  const contradictionCount = input.facts.filter((fact) => fact.status === ResearchFactStatus.CONFLICTING).length;

  if (contradictionCount > 0) {
    return result(ResearchVerificationStatus.CONFLICTING, signals.length, supportingContents.length, evidenceRecordCount, distinctSourceCount, input.candidateClaimCount, contradictionCount, [`${contradictionCount} evidence-backed claim(s) are explicitly marked conflicting.`, 'Human review is required before automatic production.'], false);
  }
  if (supportingContents.length === 0) {
    return result(ResearchVerificationStatus.INSUFFICIENT, signals.length, 0, evidenceRecordCount, 0, input.candidateClaimCount, 0, ['No usable source content is available for this topic.'], false);
  }

  const supportedFactCount = input.facts.filter((fact) => fact.status === ResearchFactStatus.SUPPORTED).length;
  if (supportingContents.length < MINIMUM_SUPPORTING_EVIDENCE || distinctSourceCount < MINIMUM_DISTINCT_SOURCES) {
    return result(
      distinctSourceCount < 2 ? ResearchVerificationStatus.SINGLE_SOURCE : ResearchVerificationStatus.INSUFFICIENT,
      signals.length,
      supportingContents.length,
      evidenceRecordCount,
      distinctSourceCount,
      input.candidateClaimCount,
      0,
      [`Research requires at least ${MINIMUM_SUPPORTING_EVIDENCE} independent supporting contents from ${MINIMUM_DISTINCT_SOURCES} distinct source identities.`, 'Description/transcript chunks for one article or video count as one supporting content.'],
      false,
    );
  }
  if (supportedFactCount === 0) {
    return result(ResearchVerificationStatus.INSUFFICIENT, signals.length, supportingContents.length, evidenceRecordCount, distinctSourceCount, input.candidateClaimCount, 0, ['Evidence has sufficient independent content and source diversity but no grounded factual proposition is independently supported yet.'], false);
  }
  return result(
    ResearchVerificationStatus.CORROBORATED,
    signals.length,
    supportingContents.length,
    evidenceRecordCount,
    distinctSourceCount,
    input.candidateClaimCount,
    0,
    [`Evidence spans ${supportingContents.length} independent supporting contents and ${distinctSourceCount} distinct source identities, with grounded supported factual material.`, 'Source diversity is a conservative proxy for independence, not proof of editorial independence.'],
    true,
  );
}

function result(verificationStatus: ResearchVerificationStatus, evidenceSignalCount: number, supportingContentCount: number, evidenceRecordCount: number, distinctSourceCount: number, candidateClaimCount: number, contradictionCount: number, verificationReasons: string[], canProceedAutomatically: boolean): ResearchVerification {
  return { verificationStatus, supportingContentCount, evidenceRecordCount, evidenceSignalCount, distinctSourceCount, independentSourceCount: distinctSourceCount, candidateClaimCount, contradictionCount, verificationReasons, canProceedAutomatically };
}

function distinctBy<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}
