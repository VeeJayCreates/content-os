import type { ResearchLifecycleState, ResearchVerificationStatus } from './enums.js';

/** A review-only topic summary; it deliberately contains no downstream production action. */
export interface ResearchReviewQueueItem {
  researchPackageId: string;
  opportunityId: string;
  projectId: string;
  title: string;
  topicStrength: number;
  contentPotentialScore: number;
  contentPotentialRecommendation: 'selected' | 'hold' | 'rejected';
  contentPotentialReason: string;
  researchConfidence: number;
  supportingEvidenceCount: number;
  evidenceRecordCount: number;
  distinctSourceCount: number;
  lifecycleState: ResearchLifecycleState;
  verificationStatus: ResearchVerificationStatus;
  supportedFacts: string[];
  unverifiedFacts: string[];
  sourceNames: string[];
  updatedAt: string;
  reviewReadyReason: string | null;
}

export interface ResearchAutomationRun {
  projectId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastRunAt: string | null;
  nextRunAt: string | null;
  opportunitiesProcessed: number;
  providerFailures: number;
  warnings: string[];
}
