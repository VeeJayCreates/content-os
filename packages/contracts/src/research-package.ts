import type { ResearchSourceProject } from "./research-source.js";
import {
  ResearchFactStatus,
  ResearchPackageStatus,
  ResearchVerificationStatus,
  ResearchLifecycleState,
} from "./enums.js";
import type { GeographicEntity } from './geographic-reference.js';

export interface ResearchPackage {
  id: string;
  projectId: string;
  opportunityId: string;
  project: ResearchSourceProject;
  opportunityTitle: string;
  title: string;
  summary: string;
  status: ResearchPackageStatus;
  lifecycleState: ResearchLifecycleState;
  confidenceScore: number;
  sourceCount: number;
  signalCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchEvidence {
  signalId: string;
  researchSourceId: string;
  title: string;
  url: string;
  summary: string | null;
  sourceName: string;
  publishedAt: string | null;
  discoveredAt: string;
}

/**
 * Evidence quality based on stored, topic-relevant evidence. An independent
 * source is a distinct configured Research Source identity, not proof of
 * editorial or journalistic independence.
 */
export interface ResearchVerification {
  verificationStatus: ResearchVerificationStatus;
  /** Distinct underlying articles/videos/documents, never extraction chunks. */
  supportingContentCount: number;
  /** Persisted description/transcript/article records; not a readiness gate. */
  evidenceRecordCount: number;
  evidenceSignalCount: number;
  distinctSourceCount: number;
  independentSourceCount: number;
  candidateClaimCount: number;
  contradictionCount: number;
  verificationReasons: string[];
  canProceedAutomatically: boolean;
}

export interface ResearchFact {
  id: string;
  claim: string;
  confidence: number;
  status: ResearchFactStatus;
  geographicEntities: GeographicEntity[];
  evidence: ResearchEvidence[];
  createdAt: string;
}

export interface ResearchPackageDetail extends ResearchPackage {
  facts: ResearchFact[];
  signals: ResearchEvidence[];
  verification: ResearchVerification;
}

export interface ResearchPackageGenerationResult {
  packageId: string;
  signalsProcessed: number;
  sourcesUsed: number;
  factsCreated: number;
  factsUpdated: number;
  confidenceScore: number;
  verification: ResearchVerification;
  warnings: string[];
}

export interface ResearchExpansionResult {
  opportunityId: string;
  status: 'skipped' | 'expanded' | 'exhausted' | 'failed';
  queriesPlanned: number;
  queriesSkipped: number;
  sourcesSearched: number;
  signalsDiscovered: number;
  candidateEvidenceAccepted: number;
  duplicateEvidenceRejected: number;
  providerFailures: number;
  verification: ResearchVerification;
  warnings: string[];
  runtimeMs: number;
}
