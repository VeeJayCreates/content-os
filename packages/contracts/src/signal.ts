import type { ResearchSourceProject } from "./research-source.js";
import { ResearchSourceType } from "./enums.js";
export type TranscriptReviewStatus = 'pending' | 'processing' | 'available' | 'no_captions' | 'retry_scheduled' | 'permanent_failure' | 'failed' | 'not_checked';
export interface SignalTranscriptSummary { status: TranscriptReviewStatus; language: string | null; trackKind: 'manual_youtube' | 'auto_youtube' | 'whisper' | null; }
export interface SignalTranscript extends SignalTranscriptSummary { signalId: string; videoId: string | null; sourceType: ResearchSourceType; content: string | null; metadata: Record<string, unknown>; }
export interface Signal { id: string; projectId: string; researchSourceId: string; sourceType: ResearchSourceType; externalId: string; title: string; url: string; summary: string | null; publishedAt: string | null; discoveredAt: string; createdAt: string; project: ResearchSourceProject; sourceName: string; /** The normalized underlying subject, distinct from the competitor's source-video title. */ researchTopic: string | null; transcript: SignalTranscriptSummary; }
export interface IngestionResult { fetchedCount: number; createdCount: number; duplicateCount: number; skippedCount: number; warnings: string[]; }
