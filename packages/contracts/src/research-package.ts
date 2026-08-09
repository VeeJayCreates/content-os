import type { ResearchSourceProject } from "./research-source.js";
import { ResearchFactStatus, ResearchPackageStatus } from "./enums.js";

export interface ResearchPackage {
  id: string;
  projectId: string;
  opportunityId: string;
  project: ResearchSourceProject;
  opportunityTitle: string;
  title: string;
  summary: string;
  status: ResearchPackageStatus;
  confidenceScore: number;
  sourceCount: number;
  signalCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchEvidence {
  signalId: string;
  title: string;
  url: string;
  summary: string | null;
  sourceName: string;
  publishedAt: string | null;
  discoveredAt: string;
}

export interface ResearchFact {
  id: string;
  claim: string;
  confidence: number;
  status: ResearchFactStatus;
  evidence: ResearchEvidence[];
  createdAt: string;
}

export interface ResearchPackageDetail extends ResearchPackage {
  facts: ResearchFact[];
  signals: ResearchEvidence[];
}

export interface ResearchPackageGenerationResult {
  packageId: string;
  signalsProcessed: number;
  sourcesUsed: number;
  factsCreated: number;
  factsUpdated: number;
  confidenceScore: number;
  warnings: string[];
}
