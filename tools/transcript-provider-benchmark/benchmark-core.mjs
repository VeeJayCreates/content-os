import { createHash } from 'node:crypto';

export const COMPLETENESS = Object.freeze({ COMPLETE: 'complete', INCOMPLETE: 'incomplete', UNKNOWN: 'unknown', NO_CAPTIONS: 'no_captions', OPERATIONAL_FAILURE: 'operational_failure' });

export function normalizeSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments
    .map((segment) => {
      const text = typeof segment?.text === 'string' ? segment.text.replace(/\s+/g, ' ').trim() : '';
      const startMs = segment?.startMs !== undefined ? finiteMillisecondValue(segment.startMs) : finiteSecondsValue(segment?.start ?? segment?.offset);
      const durationMs = segment?.durationMs !== undefined ? finiteMillisecondValue(segment.durationMs) : finiteSecondsValue(segment?.duration ?? segment?.length);
      return text && startMs !== null && durationMs !== null && durationMs > 0 ? { text, startMs, durationMs } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.startMs - right.startMs);
}

export function transcriptMetrics(segments, videoDurationMs = null) {
  const normalized = normalizeSegments(segments);
  const firstTimestampMs = normalized.at(0)?.startMs ?? null;
  const lastTimestampMs = normalized.length ? normalized.at(-1).startMs + normalized.at(-1).durationMs : null;
  const text = normalized.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();
  const timelineSpanMs = firstTimestampMs !== null && lastTimestampMs !== null ? Math.max(0, lastTimestampMs - firstTimestampMs) : null;
  const coverageRatio = positiveFinite(videoDurationMs) && timelineSpanMs !== null ? timelineSpanMs / videoDurationMs : null;
  return { segmentCount: normalized.length, wordCount: text ? text.split(/\s+/).length : 0, characterCount: text.length, firstTimestampMs, lastTimestampMs, timelineSpanMs, coverageRatio, videoDurationMs: positiveFinite(videoDurationMs) ? videoDurationMs : null };
}

/** Conservative by design: text with unknown timing cannot be declared complete. */
export function classifyCompleteness({ outcome, segments, videoDurationMs = null }) {
  if (outcome === 'no_captions') return { classification: COMPLETENESS.NO_CAPTIONS, reason: 'provider_confirmed_no_captions', metrics: transcriptMetrics([], videoDurationMs) };
  if (outcome !== 'success') return { classification: COMPLETENESS.OPERATIONAL_FAILURE, reason: 'provider_did_not_return_transcript', metrics: transcriptMetrics([], videoDurationMs) };
  const metrics = transcriptMetrics(segments, videoDurationMs);
  if (metrics.segmentCount < 3 || metrics.characterCount < 240 || metrics.wordCount < 40) return { classification: COMPLETENESS.INCOMPLETE, reason: 'transcript_too_small', metrics };
  if (metrics.firstTimestampMs !== null && metrics.firstTimestampMs > 90_000) return { classification: COMPLETENESS.INCOMPLETE, reason: 'transcript_starts_too_late', metrics };
  if (metrics.videoDurationMs !== null) {
    if (metrics.coverageRatio === null || metrics.coverageRatio < 0.55) return { classification: COMPLETENESS.INCOMPLETE, reason: 'timeline_coverage_below_threshold', metrics };
    if ((metrics.lastTimestampMs ?? 0) < metrics.videoDurationMs * 0.7) return { classification: COMPLETENESS.INCOMPLETE, reason: 'transcript_ends_too_early', metrics };
    return { classification: COMPLETENESS.COMPLETE, reason: 'sufficient_timeline_coverage', metrics };
  }
  return { classification: COMPLETENESS.UNKNOWN, reason: 'video_duration_unavailable', metrics };
}

export function classifyProviderFailure(error) {
  const text = String(error?.message ?? error ?? '').toLowerCase();
  if (/no captions|transcripts? disabled|caption.*not available/.test(text)) return 'no_captions';
  if (/\b429\b|too many requests|rate limit/.test(text)) return 'rate_limited';
  if (/not a bot|sign in to confirm|bot challenge/.test(text)) return 'bot_challenge';
  if (/enoent|not recognized|command not found|missing executable/.test(text)) return 'provider_unavailable';
  if (/timed out|etimedout|econnreset|enotfound|network/.test(text)) return 'network_failure';
  return 'provider_execution_failed';
}

export function emptyBenchmark({ providers, videos, paceMs, phase }) {
  return { version: 1, phase, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), configuration: { providers, concurrency: 1, paceMs }, videos: videos.map((video) => ({ ...video, videoId: normalizeVideoId(video.videoId) })), attempts: [] };
}

export function attemptKey(attempt) { return `${attempt.provider}:${attempt.videoId}`; }
export function mergeAttempt(state, attempt) {
  const key = attemptKey(attempt);
  const attempts = [...state.attempts.filter((existing) => attemptKey(existing) !== key), attempt];
  return { ...state, updatedAt: new Date().toISOString(), attempts };
}

export function aggregateAttempts(attempts) {
  const byProvider = {};
  for (const attempt of attempts) {
    const aggregate = byProvider[attempt.provider] ??= { attempted: 0, complete: 0, incomplete: 0, unknown: 0, noCaptions: 0, operationalFailures: 0, rateLimited: 0, botChallenges: 0, durationsMs: [] };
    aggregate.attempted += 1;
    if (attempt.completeness === COMPLETENESS.COMPLETE) aggregate.complete += 1;
    else if (attempt.completeness === COMPLETENESS.INCOMPLETE) aggregate.incomplete += 1;
    else if (attempt.completeness === COMPLETENESS.UNKNOWN) aggregate.unknown += 1;
    else if (attempt.completeness === COMPLETENESS.NO_CAPTIONS) aggregate.noCaptions += 1;
    else aggregate.operationalFailures += 1;
    if (attempt.failureClassification === 'rate_limited') aggregate.rateLimited += 1;
    if (attempt.failureClassification === 'bot_challenge') aggregate.botChallenges += 1;
    if (positiveFinite(attempt.durationMs)) aggregate.durationsMs.push(attempt.durationMs);
  }
  return Object.fromEntries(Object.entries(byProvider).map(([provider, aggregate]) => {
    const accessible = aggregate.attempted - aggregate.noCaptions;
    const durations = aggregate.durationsMs.sort((a, b) => a - b);
    return [provider, { ...aggregate, completeRate: accessible > 0 ? aggregate.complete / accessible : null, averageLatencyMs: mean(durations), p50LatencyMs: percentile(durations, 0.5), p95LatencyMs: percentile(durations, 0.95), sustainableRequestsPerMinute: mean(durations) ? 60_000 / mean(durations) : null }];
  }));
}

export function normalizeVideoId(value) {
  const match = String(value ?? '').match(/(?:v=|youtu\.be\/|shorts\/)?([A-Za-z0-9_-]{11})/);
  if (!match?.[1]) throw new Error('invalid_youtube_video_id');
  return match[1];
}

export function inputFingerprint(video) { return createHash('sha256').update(JSON.stringify({ videoId: normalizeVideoId(video.videoId), source: video.source ?? null, channel: video.channel ?? null, videoDurationMs: video.videoDurationMs ?? null })).digest('hex'); }
export function isLiveExecutionAuthorized(args) { return args.live === 'true'; }
function finiteMillisecondValue(value) { const numeric = Number(value); return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null; }
function finiteSecondsValue(value) { const numeric = Number(value); return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 1000) : null; }
function positiveFinite(value) { return Number.isFinite(value) && value > 0; }
function mean(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null; }
function percentile(values, ratio) { return values.length ? values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))] : null; }
