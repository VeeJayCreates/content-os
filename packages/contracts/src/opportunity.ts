import type { ResearchSourceProject } from "./research-source.js";
import type { OpportunityMetricsV2 } from "./opportunity-metrics.js";
import type { TranscriptReviewStatus } from "./signal.js";
import { OpportunityStatus } from "./enums.js";

export interface Opportunity {
  id: string;
  projectId: string;
  project: ResearchSourceProject;
  title: string;
  representativeUrl: string;
  summary: string | null;
  status: OpportunityStatus;
  score: number;
  signalCount: number;
  sourceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityDetectionResult {
  signalsProcessed: number;
  opportunitiesCreated: number;
  opportunitiesUpdated: number;
  linksCreated: number;
  warnings: string[];
}

export interface OpportunitySignal {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  sourceName: string;
  publishedAt: string | null;
  discoveredAt: string;
  transcript: {
    status: TranscriptReviewStatus;
    hasCanonicalTranscript: boolean;
    language: string | null;
  };
}

export interface OpportunityDetail extends Opportunity {
  signals: OpportunitySignal[];
  metricsV2: OpportunityMetricsV2 | null;
}
