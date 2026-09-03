export type TranscriptCompleteness = 'complete' | 'incomplete' | 'unknown';

/** Persisted with acquired evidence so legacy terminal outcomes can be audited safely. */
export const YOUTUBE_TRANSCRIPT_COMPLETENESS_VERSION = 'youtube-transcript-completeness-v1';

export type TimestampedTranscriptSegment = {
  text: string;
  startMs: number;
  endMs: number;
};

export type TranscriptCompletenessResult = {
  classification: TranscriptCompleteness;
  reason: 'transcript_too_small' | 'transcript_starts_too_late' | 'timeline_coverage_below_threshold' | 'transcript_ends_too_early' | 'video_duration_unavailable' | 'sufficient_timeline_coverage';
  metrics: {
    segmentCount: number;
    wordCount: number;
    characterCount: number;
    firstTimestampMs: number | null;
    lastTimestampMs: number | null;
    coverageRatio: number | null;
    videoDurationMs: number | null;
  };
};

/**
 * Production counterpart of the benchmark's conservative completeness policy.
 * Keep the thresholds aligned with tools/transcript-provider-benchmark/benchmark-core.mjs.
 */
export function assessYouTubeTranscriptCompleteness(segments: TimestampedTranscriptSegment[], videoDurationMs: number | null): TranscriptCompletenessResult {
  const normalized = segments
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.startMs >= 0 && segment.endMs > segment.startMs && Boolean(segment.text.trim()))
    .sort((left, right) => left.startMs - right.startMs);
  const text = normalized.map((segment) => segment.text.replace(/\s+/g, ' ').trim()).join(' ').trim();
  const firstTimestampMs = normalized.at(0)?.startMs ?? null;
  const lastTimestampMs = normalized.at(-1)?.endMs ?? null;
  const trustedDuration = Number.isFinite(videoDurationMs) && (videoDurationMs ?? 0) > 0 ? Math.round(videoDurationMs as number) : null;
  const coverageRatio = trustedDuration !== null && firstTimestampMs !== null && lastTimestampMs !== null ? Math.max(0, lastTimestampMs - firstTimestampMs) / trustedDuration : null;
  const metrics = {
    segmentCount: normalized.length,
    wordCount: text ? text.split(/\s+/).length : 0,
    characterCount: text.length,
    firstTimestampMs,
    lastTimestampMs,
    coverageRatio,
    videoDurationMs: trustedDuration,
  };
  if (metrics.segmentCount < 3 || metrics.characterCount < 240 || metrics.wordCount < 40) return { classification: 'incomplete', reason: 'transcript_too_small', metrics };
  if (firstTimestampMs !== null && firstTimestampMs > 90_000) return { classification: 'incomplete', reason: 'transcript_starts_too_late', metrics };
  if (trustedDuration === null) return { classification: 'unknown', reason: 'video_duration_unavailable', metrics };
  if (coverageRatio === null || coverageRatio < 0.55) return { classification: 'incomplete', reason: 'timeline_coverage_below_threshold', metrics };
  if ((lastTimestampMs ?? 0) < trustedDuration * 0.7) return { classification: 'incomplete', reason: 'transcript_ends_too_early', metrics };
  return { classification: 'complete', reason: 'sufficient_timeline_coverage', metrics };
}
