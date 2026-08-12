jest.mock('@content-os/contracts', () => ({
  ResearchFactStatus: { SUPPORTED: 'supported', CONFLICTING: 'conflicting', UNVERIFIED: 'unverified' },
  ResearchVerificationStatus: { INSUFFICIENT: 'insufficient', SINGLE_SOURCE: 'single_source', CORROBORATED: 'corroborated', CONFLICTING: 'conflicting', REVIEW_REQUIRED: 'review_required' },
}));

import { ResearchFactStatus, ResearchVerificationStatus } from '@content-os/contracts';

import { evaluateResearchVerification } from './research-verification';

describe('evaluateResearchVerification', () => {
  it('marks absent evidence as insufficient and blocks automatic progression', () => {
    expect(
      evaluateResearchVerification({ signals: [], candidateClaimCount: 0, facts: [] }),
    ).toMatchObject({
      verificationStatus: ResearchVerificationStatus.INSUFFICIENT,
      evidenceSignalCount: 0,
      independentSourceCount: 0,
      canProceedAutomatically: false,
    });
  });

  it('treats one candidate, Signal, and configured source as single-source', () => {
    expect(
      evaluateResearchVerification({
        signals: [{ signalId: 'signal-1', researchSourceId: 'source-1' }],
        candidateClaimCount: 1,
        facts: [{ status: ResearchFactStatus.UNVERIFIED }],
      }),
    ).toMatchObject({
      verificationStatus: ResearchVerificationStatus.SINGLE_SOURCE,
      evidenceSignalCount: 1,
      distinctSourceCount: 1,
      candidateClaimCount: 1,
      canProceedAutomatically: false,
    });
  });

  it('does not turn repeated Signals from one source into corroboration', () => {
    const result = evaluateResearchVerification({
      signals: [
        { signalId: 'video-1', researchSourceId: 'channel-1' },
        { signalId: 'video-2', researchSourceId: 'channel-1' },
        { signalId: 'video-3', researchSourceId: 'channel-1' },
      ],
      candidateClaimCount: 3,
      facts: [],
    });
    expect(result).toMatchObject({
      verificationStatus: ResearchVerificationStatus.SINGLE_SOURCE,
      evidenceSignalCount: 3,
      distinctSourceCount: 1,
      independentSourceCount: 1,
    });
  });

  it('corroborates relevant evidence from two configured sources', () => {
    expect(
      evaluateResearchVerification({
        signals: [
          { signalId: 'signal-1', researchSourceId: 'source-a' },
          { signalId: 'signal-2', researchSourceId: 'source-b' },
        ],
        candidateClaimCount: 2,
        facts: [
          { status: ResearchFactStatus.SUPPORTED },
          { status: ResearchFactStatus.SUPPORTED },
        ],
      }),
    ).toMatchObject({
      verificationStatus: ResearchVerificationStatus.CORROBORATED,
      evidenceSignalCount: 2,
      independentSourceCount: 2,
      canProceedAutomatically: true,
    });
  });

  it('counts multiple candidate references to one Signal once', () => {
    expect(
      evaluateResearchVerification({
        signals: [
          { signalId: 'signal-1', researchSourceId: 'source-a' },
          { signalId: 'signal-1', researchSourceId: 'source-a' },
        ],
        candidateClaimCount: 2,
        facts: [],
      }),
    ).toMatchObject({
      evidenceSignalCount: 1,
      independentSourceCount: 1,
      verificationStatus: ResearchVerificationStatus.SINGLE_SOURCE,
    });
  });

  it('surfaces explicit conflicting fact evidence and blocks automatic progression', () => {
    expect(
      evaluateResearchVerification({
        signals: [
          { signalId: 'signal-1', researchSourceId: 'source-a' },
          { signalId: 'signal-2', researchSourceId: 'source-b' },
        ],
        candidateClaimCount: 1,
        facts: [{ status: ResearchFactStatus.CONFLICTING }],
      }),
    ).toMatchObject({
      verificationStatus: ResearchVerificationStatus.CONFLICTING,
      contradictionCount: 1,
      canProceedAutomatically: false,
    });
  });

  it('is deterministic for unchanged evidence', () => {
    const input = {
      signals: [
        { signalId: 'signal-1', researchSourceId: 'source-a' },
        { signalId: 'signal-2', researchSourceId: 'source-b' },
      ],
      candidateClaimCount: 2,
      facts: [{ status: ResearchFactStatus.SUPPORTED }],
    };
    expect(evaluateResearchVerification(input)).toEqual(
      evaluateResearchVerification(input),
    );
  });
});
