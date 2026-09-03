import type { SourceEvidenceContentStatus, SourceEvidenceContentType } from './enums.js';

export interface SourceEvidenceLocator { chunkIndex?: number; startMs?: number; endMs?: number; reference?: string; }
export interface SourceEvidenceContent {
  id: string; signalId: string; researchSourceId: string; sourceUrl: string;
  contentType: SourceEvidenceContentType; content: string | null; language: string | null;
  locator: SourceEvidenceLocator | null; sourcePublishedAt: string | null;
  acquiredAt: string; contentHash: string; acquisitionMethod: string;
  provenance: Record<string, unknown>; status: SourceEvidenceContentStatus; version: string;
}
