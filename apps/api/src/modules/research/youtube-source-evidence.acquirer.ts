import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { YouTubePoTokenProviderConfiguration, type YouTubePoTokenProviderState } from './youtube-po-token-provider.configuration';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { assessYouTubeTranscriptCompleteness, type TranscriptCompletenessResult } from './youtube-transcript-completeness';

const execFileAsync = promisify(execFile);
const MAX_DESCRIPTION_LENGTH = 8_000;
const MAX_TRANSCRIPT_WINDOW_LENGTH = 2_400;
const COMMAND_TIMEOUT_MS = 45_000;
const MAX_CAPTION_TRACK_ATTEMPTS = 6;
const YOUTUBE_TRANSCRIPT_API_PROVIDER = 'youtube-transcript-api';
const YT_DLP_PROVIDER = 'yt-dlp';

export type TranscriptDiagnosticCode = 'transcript_stored' | 'transcript_incomplete' | 'transcript_validation_unknown' | 'no_captions_available' | 'caption_track_found_fetch_failed' | 'subtitle_download_failed' | 'subtitle_parse_failed' | 'network_failed' | 'rate_limited_or_blocked' | 'video_unavailable' | 'po_provider_not_detected' | 'po_provider_configuration_failed' | 'po_provider_execution_failed' | 'yt_dlp_rate_limited' | 'youtube_bot_challenge' | 'yt_dlp_execution_failed' | 'youtube_transcript_api_timeout' | 'youtube_transcript_api_rate_limited' | 'youtube_transcript_api_runtime_failed' | 'unknown_failure';
export type CaptionTrack = { language: string; kind: 'manual' | 'automatic'; format: string | null };
export type TranscriptDiagnostic = { code: TranscriptDiagnosticCode; retryable: boolean; selectedTrack: CaptionTrack | null; availableTracks: CaptionTrack[]; reason: string | null; provider: Pick<YouTubePoTokenProviderState, 'enabled' | 'mode' | 'available' | 'diagnostic'> };
export type CaptionWindow = { content: string; language: string | null; locator: { chunkIndex: number; startMs: number; endMs: number } };

export type AcquiredYouTubeEvidence = {
  description: string | null;
  language: string | null;
  transcriptAvailable: boolean;
  transcript: CaptionWindow[];
  /** Complete normalized source result. Windows are only derived evidence. */
  segments?: CaptionSegment[];
  unavailableReason: string | null;
  transcriptDiagnostic: TranscriptDiagnostic;
  transcriptCompleteness: TranscriptCompletenessResult | null;
};

/** Public metadata only: no media download, STT, authentication, or bypass. */
@Injectable()
export class YouTubeSourceEvidenceAcquirer {
  private readonly console = new Logger(YouTubeSourceEvidenceAcquirer.name);
  constructor(private readonly poProvider: YouTubePoTokenProviderConfiguration, private readonly executionLog: ResearchExecutionLogger) {}
  /** Queue acquisition is deliberately stricter than text existence: a track must cover the video. */
  async acquireTranscript(url: string): Promise<AcquiredYouTubeEvidence> {
    const providers = transcriptProviderOrder();
    if (providers[0] === YT_DLP_PROVIDER) return this.acquireWithYtDlp(url);

    const primary = await this.acquireWithYoutubeTranscriptApi(url);
    if (primary.transcriptAvailable) return primary;

    // A single provider's failure or no-caption response is insufficient proof of
    // permanent caption absence. Preserve the primary result unless yt-dlp recovers
    // a complete transcript or independently confirms no captions.
    this.executionLog.event('info', 'youtube_transcript_provider.fallback', 'yt_dlp', {
      result: { primary: YOUTUBE_TRANSCRIPT_API_PROVIDER, primaryClassification: primary.transcriptDiagnostic.code, fallback: YT_DLP_PROVIDER },
    });
    const fallback = await this.acquireWithYtDlp(url);
    if (fallback.transcriptAvailable) return fallback;
    if (primary.transcriptDiagnostic.code === 'no_captions_available' && fallback.transcriptDiagnostic.code === 'no_captions_available') return fallback;
    return primary;
  }

  private async acquireWithYtDlp(url: string): Promise<AcquiredYouTubeEvidence> {
    const provider = this.providerState();
    if (provider.enabled && !provider.available) return unavailableEvidence('po_provider_configuration_failed', null, [], provider.diagnostic, provider);
    let metadata: Record<string, unknown>;
    try {
      const { stdout } = await this.runYtDlp('metadata', [...provider.ytDlpArgs, '--skip-download', '--no-warnings', '--no-playlist', '--dump-single-json', url], provider, null);
      metadata = JSON.parse(stdout) as Record<string, unknown>;
    } catch (error) {
      return unavailableEvidence(classifyYtDlpFailure(error), null, [], safeProcessReason(error), provider);
    }
    const language = stringValue(metadata.language);
    const tracks = captionTracks(metadata.subtitles, 'manual').concat(captionTracks(metadata.automatic_captions, 'automatic'));
    if (!tracks.length) return { description: null, language, transcriptAvailable: false, transcript: [], unavailableReason: 'no_captions_available', transcriptDiagnostic: diagnostic('no_captions_available', null, [], 'yt_dlp_reported_no_suitable_caption_tracks', provider), transcriptCompleteness: null };
    let last: { diagnostic: TranscriptDiagnostic; completeness: TranscriptCompletenessResult | null } | null = null;
    for (const track of selectCaptionTracks(tracks, language)) {
      const attempt = await this.acquireTrack(url, track, tracks);
      if (!attempt.segments.length) {
        last = { diagnostic: attempt.diagnostic, completeness: null };
        if (isOperationalStop(attempt.diagnostic.code)) break;
        continue;
      }
      const completeness = assessYouTubeTranscriptCompleteness(attempt.segments, videoDurationMs(metadata.duration));
      if (completeness.classification === 'complete') return { description: null, language: track.language, transcriptAvailable: true, transcript: attempt.transcript, segments: attempt.segments, unavailableReason: null, transcriptDiagnostic: diagnostic('transcript_stored', track, tracks, null, provider), transcriptCompleteness: completeness };
      const code: TranscriptDiagnosticCode = completeness.classification === 'incomplete' ? 'transcript_incomplete' : 'transcript_validation_unknown';
      last = { diagnostic: diagnostic(code, track, tracks, completeness.reason, provider), completeness };
    }
    return unavailableEvidence(last?.diagnostic.code ?? 'caption_track_found_fetch_failed', last?.diagnostic.selectedTrack ?? null, tracks, last?.diagnostic.reason ?? 'caption_track_download_did_not_produce_parseable_vtt', provider, last?.completeness ?? null);
  }

  /** Normal local primary provider. It returns timestamped public captions only. */
  private async acquireWithYoutubeTranscriptApi(url: string): Promise<AcquiredYouTubeEvidence> {
    const videoId = youtubeVideoId(url);
    const provider = this.providerState();
    if (!videoId) return unavailableEvidence('unknown_failure', null, [], 'invalid_youtube_video_url', provider);
    const startedAt = Date.now();
    try {
      const script = 'import json,sys; from youtube_transcript_api import YouTubeTranscriptApi; t=YouTubeTranscriptApi().fetch(sys.argv[1],languages=["hi","en"]); print(json.dumps({"language":t.language_code,"captionType":"automatic" if t.is_generated else "manual","segments":[{"text":x.text,"startMs":round(x.start*1000),"endMs":round((x.start+x.duration)*1000)} for x in t]},ensure_ascii=False))';
      const executable = youtubeTranscriptPythonExecutable();
      const args = ['-c', script, videoId];
      const options = youtubeTranscriptApiExecutionOptions();
      this.executionLog.event('info', 'youtube_transcript_api.process.started', 'started', { result: youtubeTranscriptApiProcessContext(executable, videoId, options) });
      const { stdout, stderr } = await execFileAsync(executable, args, options);
      const parsed = parseYoutubeTranscriptApiOutput(stdout);
      const segments = parsed.segments;
      const durationMs = await publicYouTubeDuration(url);
      const completeness = assessYouTubeTranscriptCompleteness(segments, durationMs);
      const track: CaptionTrack = { language: stringValue(parsed.language) ?? 'unknown', kind: parsed.captionType === 'manual' ? 'manual' : 'automatic', format: 'json3' };
      this.executionLog.event('info', 'youtube_transcript_api.process.completed', 'success', { result: { ...youtubeTranscriptApiProcessContext(executable, videoId, options), exitCode: 0, stderrSummary: classifyProcessOutput(stderr), durationMs: Date.now() - startedAt } });
      this.executionLog.event('info', 'youtube_transcript_api.completed', completeness.classification, { result: { provider: YOUTUBE_TRANSCRIPT_API_PROVIDER, executable: safeExecutable(executable), videoId, durationMs, segmentCount: segments.length, durationMsElapsed: Date.now() - startedAt } });
      if (completeness.classification !== 'complete') return unavailableEvidence(completeness.classification === 'incomplete' ? 'transcript_incomplete' : 'transcript_validation_unknown', track, [track], completeness.reason, provider, completeness);
      return { description: null, language: track.language, transcriptAvailable: true, transcript: chunkCaptionSegments(segments).map((chunk) => ({ ...chunk, language: track.language })), segments, unavailableReason: null, transcriptDiagnostic: diagnostic('transcript_stored', track, [track], null, provider), transcriptCompleteness: completeness };
    } catch (error) {
      const executable = youtubeTranscriptPythonExecutable();
      const failure = classifyYoutubeTranscriptApiFailure(error);
      this.executionLog.event('warn', 'youtube_transcript_api.process.failed', failure.code, { result: { ...youtubeTranscriptApiProcessContext(executable, videoId), ...failure.diagnostic, durationMs: Date.now() - startedAt } });
      this.console.warn(`YouTube transcript API process diagnostic ${JSON.stringify({ provider: YOUTUBE_TRANSCRIPT_API_PROVIDER, videoId, ...failure.diagnostic })}.`);
      return unavailableEvidence(failure.code, null, [], failure.reason, provider);
    }
  }

  async acquire(url: string): Promise<AcquiredYouTubeEvidence> {
    const provider = this.providerState();
    if (provider.enabled && !provider.available) return unavailableEvidence('po_provider_configuration_failed', null, [], provider.diagnostic, provider);
    let metadata: Record<string, unknown>;
    try {
      const { stdout } = await this.runYtDlp('metadata', [...provider.ytDlpArgs, '--skip-download', '--no-warnings', '--no-playlist', '--dump-single-json', url], provider, null);
      metadata = JSON.parse(stdout) as Record<string, unknown>;
    } catch (error) {
      return unavailableEvidence(classifyYtDlpFailure(error), null, [], safeProcessReason(error), provider);
    }

    const description = cleanDescription(metadata.description);
    const language = stringValue(metadata.language);
    const tracks = captionTracks(metadata.subtitles, 'manual').concat(captionTracks(metadata.automatic_captions, 'automatic'));
    if (!tracks.length) return { description, language, transcriptAvailable: false, transcript: [], unavailableReason: 'no_captions_available', transcriptDiagnostic: diagnostic('no_captions_available', null, [], 'yt_dlp_reported_no_suitable_caption_tracks', provider), transcriptCompleteness: null };

    let last: { diagnostic: TranscriptDiagnostic; completeness: TranscriptCompletenessResult | null } | null = null;
    for (const track of selectCaptionTracks(tracks, language)) {
      const attempt = await this.acquireTrack(url, track, tracks);
      if (attempt.segments.length) {
        const completeness = assessYouTubeTranscriptCompleteness(attempt.segments, videoDurationMs(metadata.duration));
        if (completeness.classification === 'complete') return { description, language, transcriptAvailable: true, transcript: attempt.transcript, segments: attempt.segments, unavailableReason: null, transcriptDiagnostic: diagnostic('transcript_stored', track, tracks, null, provider), transcriptCompleteness: completeness };
        last = { diagnostic: diagnostic(completeness.classification === 'incomplete' ? 'transcript_incomplete' : 'transcript_validation_unknown', track, tracks, completeness.reason, provider), completeness };
        continue;
      }
      last = { diagnostic: attempt.diagnostic, completeness: null };
      if (isOperationalStop(attempt.diagnostic.code)) break;
    }
    return { description, language, transcriptAvailable: false, transcript: [], unavailableReason: last?.diagnostic.code ?? 'caption_track_found_fetch_failed', transcriptDiagnostic: last?.diagnostic ?? diagnostic('caption_track_found_fetch_failed', null, tracks, 'caption_track_download_did_not_produce_parseable_vtt', provider), transcriptCompleteness: last?.completeness ?? null };
  }

  private async acquireTrack(url: string, track: CaptionTrack, availableTracks: CaptionTrack[]): Promise<{ transcript: CaptionWindow[]; segments: CaptionSegment[]; diagnostic: TranscriptDiagnostic }> {
    const provider = this.providerState();
    if (provider.enabled && !provider.available) return { transcript: [], segments: [], diagnostic: diagnostic('po_provider_configuration_failed', track, availableTracks, provider.diagnostic, provider) };
    const directory = await mkdtemp(join(tmpdir(), 'content-os-youtube-captions-'));
    try {
      await this.runYtDlp('caption_download', buildCaptionDownloadArgs(track, join(directory, '%(id)s.%(ext)s'), url, provider.ytDlpArgs), provider, directory);
      const file = (await readdir(directory)).filter((name) => name.endsWith('.vtt')).sort()[0];
      if (!file) return { transcript: [], segments: [], diagnostic: diagnostic('subtitle_download_failed', track, availableTracks, 'yt_dlp_completed_without_creating_vtt', provider) };
      try {
        const segments = parseWebVtt(await readFile(join(directory, file), 'utf8'));
        const transcript = chunkCaptionSegments(segments).map((chunk) => ({ ...chunk, language: track.language }));
        return transcript.length ? { transcript, segments, diagnostic: diagnostic('transcript_stored', track, availableTracks, null, provider) } : { transcript: [], segments: [], diagnostic: diagnostic('subtitle_parse_failed', track, availableTracks, 'vtt_contained_no_usable_caption_cues', provider) };
      } catch { return { transcript: [], segments: [], diagnostic: diagnostic('subtitle_parse_failed', track, availableTracks, 'vtt_parse_failed', provider) }; }
    } catch (error) {
      return { transcript: [], segments: [], diagnostic: diagnostic(classifyYtDlpFailure(error), track, availableTracks, safeProcessReason(error), provider) };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  private providerState(): YouTubePoTokenProviderState { return this.poProvider.resolve(); }
  private async runYtDlp(operation: 'metadata' | 'caption_download', args: string[], provider: YouTubePoTokenProviderState, directory: string | null) {
    const startedAt = Date.now();
    const processArgs = process.env.YOUTUBE_YTDLP_DIAGNOSTICS?.trim().toLowerCase() === 'true' ? ['--verbose', ...args] : args;
    const base = { operation, executable: 'yt-dlp', args: sanitizeYtDlpArgs(processArgs), cwd: process.cwd(), tempDirectory: directory ? safeTempDirectory(directory) : null, expectedOutput: directory ? '%(id)s.%(ext)s' : null, provider: safeProvider(provider), jsRuntime: effectiveJsRuntime(provider) };
    this.executionLog.event('info', 'youtube_caption_process.started', 'started', { result: base });
    try {
      const result = await execFileAsync('yt-dlp', processArgs, { windowsHide: true, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 });
      const diagnostic = { ...base, exitCode: 0, terminationSignal: null, durationMs: Date.now() - startedAt, stdoutClassification: classifyProcessOutput(result.stdout), stderrClassification: classifyProcessOutput(result.stderr), providerDetected: detectProvider(result.stdout, result.stderr, provider), vttAppeared: directory ? (await readdir(directory)).some((name) => name.endsWith('.vtt')) : null, finalClassification: 'success' };
      this.executionLog.event('info', 'youtube_caption_process.completed', 'success', { result: diagnostic, durationMs: diagnostic.durationMs });
      return result;
    } catch (error) {
      const detail = processFailureDetail(error);
      const classification = classifyYtDlpFailure(error);
      const diagnostic = { ...base, exitCode: detail.exitCode, terminationSignal: detail.terminationSignal, durationMs: Date.now() - startedAt, stdoutClassification: classifyProcessOutput(detail.stdout), stderrClassification: classifyProcessOutput(detail.stderr), providerDetected: detectProvider(detail.stdout, detail.stderr, provider), vttAppeared: directory ? (await readdir(directory)).some((name) => name.endsWith('.vtt')) : null, finalClassification: classification };
      this.executionLog.event('warn', 'youtube_caption_process.failed', classification, { result: diagnostic, durationMs: diagnostic.durationMs });
      this.console.warn(`YouTube caption process diagnostic ${JSON.stringify(diagnostic)}.`);
      throw error;
    }
  }
}

function unavailableEvidence(code: TranscriptDiagnosticCode, selectedTrack: CaptionTrack | null, availableTracks: CaptionTrack[], reason: string | null, provider: YouTubePoTokenProviderState = disabledProvider(), transcriptCompleteness: TranscriptCompletenessResult | null = null): AcquiredYouTubeEvidence {
  return { description: null, language: null, transcriptAvailable: false, transcript: [], unavailableReason: code, transcriptDiagnostic: diagnostic(code, selectedTrack, availableTracks, reason, provider), transcriptCompleteness };
}
function diagnostic(code: TranscriptDiagnosticCode, selectedTrack: CaptionTrack | null, availableTracks: CaptionTrack[], reason: string | null = null, provider: YouTubePoTokenProviderState = disabledProvider()): TranscriptDiagnostic { return { code, retryable: isRetryable(code), selectedTrack, availableTracks, reason, provider: { enabled: provider.enabled, mode: provider.mode, available: provider.available, diagnostic: provider.diagnostic } }; }
function disabledProvider(): YouTubePoTokenProviderState { return { enabled: false, mode: null, available: false, diagnostic: 'disabled', ytDlpArgs: [] }; }

/** Uses yt-dlp's public subtitle writer flags; no shell interpolation is used. */
export function buildCaptionDownloadArgs(track: CaptionTrack, outputTemplate: string, url: string, providerArgs: string[] = []): string[] {
  return [...providerArgs, '--skip-download', '--no-warnings', '--no-playlist', track.kind === 'manual' ? '--write-subs' : '--write-auto-subs', '--sub-langs', track.language, '--sub-format', 'vtt', '--output', outputTemplate, url];
}

export function captionTracks(value: unknown, kind: CaptionTrack['kind']): CaptionTrack[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([language, formats]) => Array.isArray(formats) && formats.length && language ? [{ language: language.slice(0, 32), kind, format: formatFor(formats) }] : []);
}
/** Manual original-language, then manual Hindi/English, then automatic equivalents. */
export function orderCaptionTracks(tracks: CaptionTrack[], originalLanguage: string | null): CaptionTrack[] {
  const rank = (language: string) => { const normalized = language.toLowerCase(); const base = normalized.split('-')[0]; return normalized === 'en-orig' ? 0 : normalized === 'en' ? 1 : originalLanguage && normalized === originalLanguage.toLowerCase() ? 2 : base === 'hi' ? 3 : 4; };
  return [...tracks].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'manual' ? -1 : 1) || rank(a.language) - rank(b.language) || a.language.localeCompare(b.language));
}
/** Never fan one source request out across every translated caption track. */
export function selectCaptionTracks(tracks: CaptionTrack[], originalLanguage: string | null): CaptionTrack[] {
  const seen = new Set<string>();
  return orderCaptionTracks(tracks, originalLanguage).filter((track) => {
    const key = `${track.kind}:${track.language.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_CAPTION_TRACK_ATTEMPTS);
}
export function classifyYtDlpFailure(error: unknown): TranscriptDiagnosticCode {
  const detail = processFailureDetail(error); const message = `${detail.message}\n${detail.stdout}\n${detail.stderr}`.toLowerCase();
  // A downstream YouTube response takes precedence over incidental plugin text.
  if (/sign in to confirm|not a bot/.test(message)) return 'youtube_bot_challenge';
  if (/\b429\b|too many requests|rate limit/.test(message)) return 'yt_dlp_rate_limited';
  if (/no such (?:po token )?provider|provider .*not (?:found|available)|plugin .*not (?:found|available)/.test(message)) return 'po_provider_not_detected';
  if (/youtubepot|bgutil|po token provider/.test(message)) return 'po_provider_execution_failed';
  if (/private video|video unavailable|not available|deleted/.test(message)) return 'video_unavailable';
  if (/process exited|exit code|command failed/.test(message)) return 'yt_dlp_execution_failed';
  if (/enotfound|econnreset|etimedout|network|socket|timed out|winerror 10013|access permissions/.test(message)) return 'network_failed';
  if (/subtitle|caption|requested format/.test(message)) return 'caption_track_found_fetch_failed';
  return 'unknown_failure';
}
export function isRetryable(code: TranscriptDiagnosticCode) { return ['caption_track_found_fetch_failed', 'subtitle_download_failed', 'network_failed', 'rate_limited_or_blocked', 'yt_dlp_rate_limited', 'youtube_bot_challenge', 'po_provider_execution_failed', 'yt_dlp_execution_failed', 'youtube_transcript_api_timeout', 'youtube_transcript_api_rate_limited', 'youtube_transcript_api_runtime_failed', 'unknown_failure', 'transcript_incomplete', 'transcript_validation_unknown'].includes(code); }

export function cleanDescription(value: unknown): string | null { if (typeof value !== 'string') return null; const cleaned = value.replace(/https?:\/\/\S+/gi, ' ').replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim(); return cleaned.length < 40 ? null : cleaned.slice(0, MAX_DESCRIPTION_LENGTH); }
export type CaptionSegment = { text: string; startMs: number; endMs: number };
export function parseWebVtt(value: string): CaptionSegment[] {
  const cues = value.replace(/\r/g, '').split(/\n\n+/).slice(1); const result: CaptionSegment[] = [];
  for (const cue of cues) { const lines = cue.split('\n').filter(Boolean); const timeIndex = lines.findIndex((line) => line.includes('-->')); if (timeIndex < 0) continue; const [start, end] = lines[timeIndex].split('-->').map((part) => parseVttTime(part.trim().split(/\s+/)[0] ?? '')); const text = lines.slice(timeIndex + 1).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); if (start === null || end === null || end <= start || !text || result.at(-1)?.text === text) continue; result.push({ text, startMs: start, endMs: end }); }
  return result;
}
export function chunkCaptionSegments(segments: CaptionSegment[]): CaptionWindow[] {
  const windows: CaptionWindow[] = []; let parts: string[] = []; let startMs = 0; let endMs = 0;
  const flush = () => { const content = parts.join(' ').replace(/\s+/g, ' ').trim(); if (content.length >= 40) windows.push({ content, language: null, locator: { chunkIndex: windows.length, startMs, endMs } }); parts = []; };
  for (const segment of segments) { const next = [...parts, segment.text].join(' '); if (parts.length && next.length > MAX_TRANSCRIPT_WINDOW_LENGTH) flush(); if (!parts.length) startMs = segment.startMs; parts.push(segment.text); endMs = segment.endMs; if (parts.join(' ').length >= MAX_TRANSCRIPT_WINDOW_LENGTH) flush(); }
  if (parts.length) flush(); return windows;
}
function parseVttTime(value: string): number | null { const parts = value.replace(',', '.').split(':'); const seconds = Number(parts.pop()); const minutes = Number(parts.pop() ?? 0); const hours = Number(parts.pop() ?? 0); return [seconds, minutes, hours].every(Number.isFinite) ? Math.round((hours * 3600 + minutes * 60 + seconds) * 1000) : null; }
function formatFor(formats: unknown[]) { const value = formats.find((item) => item && typeof item === 'object' && (item as Record<string, unknown>).ext === 'vtt') ?? formats[0]; return value && typeof value === 'object' && typeof (value as Record<string, unknown>).ext === 'string' ? (value as Record<string, unknown>).ext as string : null; }
function stringValue(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 32) : null; }
function videoDurationMs(value: unknown) { const seconds = Number(value); return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null; }
/** API-first by default. Explicit yt-dlp selection remains available for local diagnostics only. */
export function transcriptProviderOrder(environment: NodeJS.ProcessEnv = process.env): readonly [typeof YOUTUBE_TRANSCRIPT_API_PROVIDER] | readonly [typeof YT_DLP_PROVIDER] | readonly [typeof YOUTUBE_TRANSCRIPT_API_PROVIDER, typeof YT_DLP_PROVIDER] {
  return environment.YOUTUBE_TRANSCRIPT_PROVIDER?.trim().toLowerCase() === YT_DLP_PROVIDER
    ? [YT_DLP_PROVIDER]
    : [YOUTUBE_TRANSCRIPT_API_PROVIDER, YT_DLP_PROVIDER];
}
/** Configurable to make the API process use the same validated Python installation as Windows. */
export function youtubeTranscriptPythonExecutable(environment: NodeJS.ProcessEnv = process.env) {
  return environment.YOUTUBE_TRANSCRIPT_PYTHON?.trim() || environment.PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3');
}
export function youtubeTranscriptApiChildEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...environment, PYTHONIOENCODING: 'utf-8' };
}
export function youtubeTranscriptApiExecutionOptions(environment: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  return { windowsHide: true, shell: false, cwd, env: youtubeTranscriptApiChildEnvironment(environment), timeout: COMMAND_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 };
}
export function parseYoutubeTranscriptApiOutput(stdout: string): { language: string | null; captionType: 'manual' | 'automatic'; segments: CaptionSegment[] } {
  const parsed = JSON.parse(stdout) as { language?: unknown; captionType?: unknown; segments?: Array<{ text?: unknown; startMs?: unknown; endMs?: unknown }> };
  return {
    language: stringValue(parsed.language),
    captionType: parsed.captionType === 'manual' ? 'manual' : 'automatic',
    segments: (parsed.segments ?? []).flatMap((segment) => typeof segment.text === 'string' && Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs)
      ? [{ text: segment.text, startMs: Number(segment.startMs), endMs: Number(segment.endMs) }]
      : []),
  };
}
export function classifyYoutubeTranscriptApiFailure(error: unknown): { code: TranscriptDiagnosticCode; reason: string; diagnostic: Record<string, unknown> } {
  const detail = processFailureDetail(error);
  const source = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown } : {};
  const message = `${detail.message}\n${detail.stderr}`.toLowerCase();
  const reason = /enoent/.test(message) ? 'python_executable_not_found'
    : /timed out|etimedout/.test(message) ? 'provider_timed_out'
      : /429|too many requests|rate limit/.test(message) ? 'provider_rate_limited'
        : /econnreset|enotfound|eai_again|socket|network|winerror 10013|access permissions/.test(message) ? 'provider_network_failed'
          : /no transcript|no captions|transcriptsdisabled|video unavailable|private/.test(message) ? 'caption_not_available_from_primary_provider'
            : 'provider_process_failed';
  const code: TranscriptDiagnosticCode = reason === 'provider_timed_out' ? 'youtube_transcript_api_timeout'
    : reason === 'provider_rate_limited' ? 'youtube_transcript_api_rate_limited'
      : reason === 'caption_not_available_from_primary_provider' ? 'caption_track_found_fetch_failed'
        : reason === 'provider_network_failed' ? 'network_failed'
          : 'youtube_transcript_api_runtime_failed';
  return {
    code,
    reason,
    diagnostic: {
      exitCode: detail.exitCode,
      terminationSignal: detail.terminationSignal,
      errorName: typeof source.name === 'string' ? source.name : null,
      errorCode: typeof source.code === 'string' || typeof source.code === 'number' ? source.code : null,
      errorMessage: sanitizeProviderErrorMessage(detail.message),
      stderrSummary: classifyProcessOutput(detail.stderr),
      stdoutSummary: classifyProcessOutput(detail.stdout),
    },
  };
}
async function publicYouTubeDuration(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const match = (await response.text()).match(/"lengthSeconds":"(\d+)"/);
    return match ? videoDurationMs(match[1]) : null;
  } catch { return null; }
}
function youtubeVideoId(url: string) { try { return new URL(url).searchParams.get('v'); } catch { return null; } }
function safeExecutable(value: string) { return value.includes(':') || value.includes('\\') || value.includes('/') ? '[configured]' : value; }
function youtubeTranscriptApiProcessContext(executable: string, videoId: string, options = youtubeTranscriptApiExecutionOptions()) {
  return {
    provider: YOUTUBE_TRANSCRIPT_API_PROVIDER,
    executable: safeExecutable(executable),
    args: ['-c', '[embedded_youtube_transcript_api_adapter]', videoId],
    cwd: options.cwd,
    shell: false,
    inheritedEnvironment: true,
    proxyConfigured: Boolean(options.env.HTTP_PROXY || options.env.HTTPS_PROXY || options.env.http_proxy || options.env.https_proxy),
    noProxyConfigured: Boolean(options.env.NO_PROXY || options.env.no_proxy),
    timeoutMs: options.timeout,
  };
}
function sanitizeProviderErrorMessage(message: string) {
  return message.replace(/(token|cookie|authorization|api[_-]?key|password)=?[^\s,;]+/gi, '$1=[redacted]').replace(/\s+/g, ' ').trim().slice(0, 320) || null;
}
function safeProcessReason(error: unknown): string {
  const detail = processFailureDetail(error); const message = `${detail.message}\n${detail.stdout}\n${detail.stderr}`.toLowerCase();
  if (/enoent/.test(message)) return 'yt_dlp_executable_not_found';
  if (/winerror 10013|access permissions/.test(message)) return 'network_access_denied_by_process_environment';
  if (/timed out|etimedout/.test(message)) return 'yt_dlp_timed_out';
  if (/sign in to confirm|not a bot/.test(message)) return 'youtube_bot_challenge';
  if (/429|too many requests|rate limit/.test(message)) return 'yt_dlp_rate_limited';
  if (/private video|video unavailable|not available|deleted/.test(message)) return 'youtube_video_unavailable';
  return 'yt_dlp_process_failed';
}

export function classifyProcessOutput(value: unknown): 'empty' | 'js_runtime_warning' | 'provider_message' | 'youtube_bot_challenge' | 'rate_limited' | 'other' {
  const text = typeof value === 'string' ? value.toLowerCase() : '';
  if (!text.trim()) return 'empty';
  if (/sign in to confirm|not a bot/.test(text)) return 'youtube_bot_challenge';
  if (/\b429\b|too many requests|rate limit/.test(text)) return 'rate_limited';
  if (/no supported javascript runtime/.test(text)) return 'js_runtime_warning';
  if (/youtubepot|bgutil|po token provider/.test(text)) return 'provider_message';
  return 'other';
}
export function processFailureDetail(error: unknown): { message: string; stdout: string; stderr: string; exitCode: number | null; terminationSignal: string | null } {
  const source = error && typeof error === 'object' ? error as { message?: unknown; stdout?: unknown; stderr?: unknown; code?: unknown; signal?: unknown } : {};
  return { message: typeof source.message === 'string' ? source.message : '', stdout: typeof source.stdout === 'string' ? source.stdout : '', stderr: typeof source.stderr === 'string' ? source.stderr : '', exitCode: typeof source.code === 'number' ? source.code : null, terminationSignal: typeof source.signal === 'string' ? source.signal : null };
}
export function sanitizeYtDlpArgs(args: string[]) {
  const valueFlags = new Set(['--po-token', '--cookies', '--cookies-from-browser']);
  return args.map((arg, index) => {
    if (valueFlags.has(arg)) return arg;
    if (index > 0 && valueFlags.has(args[index - 1] ?? '')) return '[redacted]';
    if (/cookie|authorization|token=|api.?key|password/i.test(arg)) return '[redacted]';
    return arg.startsWith('youtubepot-') ? arg.replace(/((?:base_url|server_home)=)[^,]+/i, '$1[configured]') : arg;
  });
}
function safeTempDirectory(directory: string) { return `temp://${directory.split(/[\\/]/).at(-1) ?? 'caption-run'}`; }
function safeProvider(provider: YouTubePoTokenProviderState) { return { enabled: provider.enabled, mode: provider.mode, available: provider.available, diagnostic: provider.diagnostic }; }
function effectiveJsRuntime(provider: YouTubePoTokenProviderState) { const index = provider.ytDlpArgs.indexOf('--js-runtimes'); return index >= 0 ? provider.ytDlpArgs[index + 1] ?? null : null; }
function detectProvider(stdout: unknown, stderr: unknown, provider: YouTubePoTokenProviderState) { if (!provider.enabled) return false; return /bgutil|youtubepot/i.test(`${typeof stdout === 'string' ? stdout : ''}\n${typeof stderr === 'string' ? stderr : ''}`); }
function isOperationalStop(code: TranscriptDiagnosticCode) { return ['network_failed', 'rate_limited_or_blocked', 'yt_dlp_rate_limited', 'youtube_bot_challenge', 'video_unavailable', 'po_provider_not_detected', 'po_provider_configuration_failed', 'po_provider_execution_failed'].includes(code); }
