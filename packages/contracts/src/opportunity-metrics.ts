export const OPPORTUNITY_METRICS_V2_VERSION = 'opportunity-metrics-v2';

export interface OpportunityMetricsV2 {
  id: string;
  opportunityId: string;
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
