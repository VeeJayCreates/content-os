jest.mock('@content-os/contracts', () => ({
  OPPORTUNITY_METRICS_V2_VERSION: 'opportunity-metrics-v2',
  ResearchSourceType: {
    RSS: 'rss',
    WEBSITE: 'website',
    YOUTUBE: 'youtube',
  },
}));

import { scoreOpportunity } from './opportunity-detection';
import { calculateOpportunityMetricsV2 } from './opportunity-metrics-v2';
import { scoreResearchConfidence } from './research-package';

const calculationTime = new Date('2026-08-10T12:00:00.000Z');
const signal = (
  overrides: Partial<{
    id: string;
    researchSourceId: string;
    sourceType: 'rss' | 'website' | 'youtube';
    discoveredAt: string;
  }> = {},
) => ({
  id: 'signal-1',
  researchSourceId: 'source-1',
  sourceType: 'youtube' as const,
  title: 'Story',
  summary: null,
  discoveredAt: '2026-08-10T11:00:00.000Z',
  ...overrides,
});

describe('Opportunity Metrics V2', () => {
  it('provides a bounded fresh one-signal, one-source baseline', () => {
    const metrics = calculateOpportunityMetricsV2([signal()], calculationTime);

    expect(metrics).toMatchObject({
      freshnessScore: 30,
      supportScore: 0,
      sourceDiversityScore: 0,
      confirmationScore: 0,
      momentumScore: 0,
      persistenceScore: 0,
      opportunityScore: 30,
      signalCount: 1,
      independentSourceCount: 1,
      sourceTypeCount: 1,
    });
  });

  it('rewards bounded support, configured-source confirmation, and type diversity', () => {
    const baseline = calculateOpportunityMetricsV2([signal()], calculationTime);
    const corroborated = calculateOpportunityMetricsV2(
      [
        signal(),
        signal({
          id: 'signal-2',
          researchSourceId: 'source-2',
          sourceType: 'rss',
        }),
        signal({
          id: 'signal-3',
          researchSourceId: 'source-3',
          sourceType: 'website',
        }),
        signal({
          id: 'signal-4',
          researchSourceId: 'source-3',
          sourceType: 'website',
        }),
      ],
      calculationTime,
    );

    expect(corroborated.supportScore).toBeGreaterThan(baseline.supportScore);
    expect(corroborated.confirmationScore).toBeGreaterThan(
      baseline.confirmationScore,
    );
    expect(corroborated.sourceDiversityScore).toBeGreaterThan(
      baseline.sourceDiversityScore,
    );
    expect(corroborated.opportunityScore).toBeGreaterThan(
      baseline.opportunityScore,
    );
    expect(corroborated.opportunityScore).toBeLessThanOrEqual(100);
  });

  it('decays old observations and keeps every component bounded', () => {
    const old = calculateOpportunityMetricsV2(
      [signal({ discoveredAt: '2026-08-01T00:00:00.000Z' })],
      calculationTime,
    );

    expect(old.freshnessScore).toBeLessThan(30);
    for (const value of [
      old.opportunityScore,
      old.freshnessScore,
      old.supportScore,
      old.sourceDiversityScore,
      old.confirmationScore,
      old.momentumScore,
      old.persistenceScore,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic for identical signals, version, and calculation time', () => {
    const signals = [
      signal(),
      signal({
        id: 'signal-2',
        researchSourceId: 'source-2',
        sourceType: 'rss',
      }),
    ];

    expect(calculateOpportunityMetricsV2(signals, calculationTime)).toEqual(
      calculateOpportunityMetricsV2([...signals].reverse(), calculationTime),
    );
  });

  it('distinguishes observable strength without making an editorial judgment', () => {
    const oneYouTubeSignal = calculateOpportunityMetricsV2(
      [signal()],
      calculationTime,
    );
    const crossSourceStory = calculateOpportunityMetricsV2(
      [
        signal({ sourceType: 'rss' }),
        signal({
          id: 'signal-2',
          researchSourceId: 'source-2',
          sourceType: 'website',
        }),
        signal({
          id: 'signal-3',
          researchSourceId: 'source-3',
          sourceType: 'youtube',
        }),
        signal({
          id: 'signal-4',
          researchSourceId: 'source-3',
          sourceType: 'youtube',
        }),
      ],
      calculationTime,
    );

    expect(crossSourceStory.opportunityScore).toBeGreaterThan(
      oneYouTubeSignal.opportunityScore,
    );
  });

  it('leaves V1 Opportunity Score and Research Confidence formulas unchanged', () => {
    const detectionSignals = [
      {
        id: 'signal-1',
        projectId: 'project-1',
        title: 'Story',
        url: 'https://example.com/story',
        summary: null,
        researchSourceId: 'source-1',
        sourceType: 'rss' as const,
        discoveredAt: '2026-08-10T11:00:00.000Z',
      },
    ];

    expect(scoreOpportunity(detectionSignals, calculationTime)).toBe(75);
    expect(scoreResearchConfidence([signal()], calculationTime)).toBe(60);
  });
});
