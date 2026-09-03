export type TranscriptAcquisitionJobStatus =
  | 'pending'
  | 'processing'
  | 'available'
  | 'no_captions'
  | 'retryable_failure'
  | 'permanent_failure';

export interface TranscriptAcquisitionJob {
  id: string;
  projectId: string;
  signalId: string;
  version: string;
  status: TranscriptAcquisitionJobStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  failureClassification: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptQueueSummary {
  pending: number;
  processing: number;
  available: number;
  noCaptions: number;
  retryableFailure: number;
  permanentFailure: number;
}
