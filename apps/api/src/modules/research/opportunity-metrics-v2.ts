import { createHash } from 'node:crypto';

import {
  OPPORTUNITY_METRICS_V2_VERSION,
  ResearchSourceType,
} from '@content-os/contracts';

export { OPPORTUNITY_METRICS_V2_VERSION };

const FRESHNESS_WINDOW_MS = 12 * 60 * 60 * 1000;
const OBSERVATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OpportunityMetricSignal {
  id: string;
  researchSourceId: string;
  sourceType: ResearchSourceType;
  discoveredAt: string;
}

export interface OpportunityMetricsCalculation {
  scoreVersion: typeof OPPORTUNITY_METRICS_V2_VERSION;
  opportunityScore: number;
  freshnessScore: number;
  supportScore: number;
  sourceDiversityScore: number;
  confirmationScore: number;
  momentumScore: number;
  persistenceScore: number;
  signalCount: number;
  independentSourceCount: number;
  sourceTypeCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  calculatedAt: string;
  inputHash: string;
}

export function calculateOpportunityMetricsV2(
  signals: OpportunityMetricSignal[],
  calculationTime: Date,
): OpportunityMetricsCalculation {
  if (signals.length === 0) {
    throw new Error('Opportunity metrics require at least one signal');
  }

  const firstSeenAt = signals.reduce(
    (first, signal) =>
      signal.discoveredAt < first ? signal.discoveredAt : first,
    signals[0]?.discoveredAt ?? '',
  );
  const lastSeenAt = signals.reduce(
    (last, signal) => (signal.discoveredAt > last ? signal.discoveredAt : last),
    signals[0]?.discoveredAt ?? '',
  );
  const independentSourceCount = new Set(
    signals.map((signal) => signal.researchSourceId),
  ).size;
  const sourceTypeCount = new Set(signals.map((signal) => signal.sourceType))
    .size;
  const freshnessScore = scoreFreshness(lastSeenAt, calculationTime);
  const supportScore = Math.min(20, Math.round(10 * Math.log2(signals.length)));
  const sourceDiversityScore =
    sourceTypeCount < 2 ? 0 : sourceTypeCount === 2 ? 8 : 15;
  const confirmationScore = Math.min(
    20,
    Math.max(0, independentSourceCount - 1) * 10,
  );
  const momentumScore = scoreObservedArrivalMomentum(signals, lastSeenAt);
  // ContentOS has no durable observation history yet, so this intentionally
  // remains neutral rather than rewarding old stories for merely persisting.
  const persistenceScore = 0;
  const opportunityScore = clamp(
    freshnessScore +
      supportScore +
      sourceDiversityScore +
      confirmationScore +
      momentumScore +
      persistenceScore,
  );
  const freshnessWindowStart = new Date(
    Math.floor(calculationTime.getTime() / FRESHNESS_WINDOW_MS) *
      FRESHNESS_WINDOW_MS,
  ).toISOString();

  return {
    scoreVersion: OPPORTUNITY_METRICS_V2_VERSION,
    opportunityScore,
    freshnessScore,
    supportScore,
    sourceDiversityScore,
    confirmationScore,
    momentumScore,
    persistenceScore,
    signalCount: signals.length,
    independentSourceCount,
    sourceTypeCount,
    firstSeenAt,
    lastSeenAt,
    calculatedAt: calculationTime.toISOString(),
    inputHash: hashMetricInputs(signals, freshnessWindowStart),
  };
}

function scoreFreshness(lastSeenAt: string, calculationTime: Date): number {
  const ageHours = Math.max(
    0,
    (calculationTime.getTime() - new Date(lastSeenAt).getTime()) / 3_600_000,
  );

  return Math.max(0, 30 - Math.floor(ageHours / 12) * 3);
}

function scoreObservedArrivalMomentum(
  signals: OpportunityMetricSignal[],
  lastSeenAt: string,
): number {
  const windowStart = new Date(lastSeenAt).getTime() - OBSERVATION_WINDOW_MS;
  const recentSourceCount = new Set(
    signals
      .filter(
        (signal) => new Date(signal.discoveredAt).getTime() >= windowStart,
      )
      .map((signal) => signal.researchSourceId),
  ).size;

  return Math.min(10, Math.max(0, recentSourceCount - 1) * 5);
}

function hashMetricInputs(
  signals: OpportunityMetricSignal[],
  freshnessWindowStart: string,
): string {
  const input = {
    scoreVersion: OPPORTUNITY_METRICS_V2_VERSION,
    freshnessWindowStart,
    signals: [...signals]
      .map((signal) => ({
        id: signal.id,
        researchSourceId: signal.researchSourceId,
        sourceType: signal.sourceType,
        discoveredAt: signal.discoveredAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
