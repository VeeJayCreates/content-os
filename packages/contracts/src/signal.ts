import type { ResearchSourceProject } from "./research-source.js";
import { ResearchSourceType } from "./enums.js";
export interface Signal { id: string; projectId: string; researchSourceId: string; sourceType: ResearchSourceType; externalId: string; title: string; url: string; summary: string | null; publishedAt: string | null; discoveredAt: string; createdAt: string; project: ResearchSourceProject; sourceName: string; }
export interface IngestionResult { fetchedCount: number; createdCount: number; duplicateCount: number; skippedCount: number; warnings: string[]; }
