import { buildCaptionDownloadArgs, captionTracks, chunkCaptionSegments, classifyProcessOutput, classifyYoutubeTranscriptApiFailure, classifyYtDlpFailure, cleanDescription, isRetryable, orderCaptionTracks, parseWebVtt, parseYoutubeTranscriptApiOutput, processFailureDetail, sanitizeYtDlpArgs, selectCaptionTracks, transcriptProviderOrder, YouTubeSourceEvidenceAcquirer, youtubeTranscriptApiExecutionOptions, youtubeTranscriptPythonExecutable } from './youtube-source-evidence.acquirer';

const availableEvidence = { description: null, language: 'hi', transcriptAvailable: true, transcript: [{ content: 'Validated caption text', language: 'hi', locator: { chunkIndex: 0, startMs: 0, endMs: 10_000 } }], unavailableReason: null, transcriptDiagnostic: { code: 'transcript_stored', retryable: false, selectedTrack: { language: 'hi', kind: 'automatic', format: 'json3' }, availableTracks: [], reason: null, provider: { enabled: false, mode: null, available: false, diagnostic: 'disabled' } }, transcriptCompleteness: { classification: 'complete', reason: null } };
const retryableEvidence = { ...availableEvidence, transcriptAvailable: false, transcript: [], unavailableReason: 'network_failed', transcriptDiagnostic: { ...availableEvidence.transcriptDiagnostic, code: 'network_failed', retryable: true, selectedTrack: null }, transcriptCompleteness: null };

function acquirerForRoutingTests() {
  return new YouTubeSourceEvidenceAcquirer({ resolve: jest.fn(() => ({ enabled: false, mode: null, available: false, diagnostic: 'disabled', ytDlpArgs: [] })) } as never, { event: jest.fn() } as never) as unknown as {
    acquireTranscript(url: string): Promise<unknown>;
    acquireWithYoutubeTranscriptApi(url: string): Promise<unknown>;
    acquireWithYtDlp(url: string): Promise<unknown>;
  };
}

describe('YouTubeSourceEvidenceAcquirer cleanup', () => {
  it('removes links and hashtags while retaining bounded source description text', () => {
    expect(cleanDescription('This public description contains enough substantive source content for fact extraction. https://example.test #news')).toBe('This public description contains enough substantive source content for fact extraction.');
  });
  it('rejects short or absent descriptions rather than treating titles as evidence', () => {
    expect(cleanDescription('short')).toBeNull();
    expect(cleanDescription(null)).toBeNull();
  });

  it('creates deterministic bounded caption windows while retaining time locators', () => {
    const cues = parseWebVtt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nThis is the first substantive public caption sentence for extraction.\n\n00:00:02.000 --> 00:00:04.500\nThis is the second substantive public caption sentence for grounding.`);
    const windows = chunkCaptionSegments(cues);
    expect(windows).toEqual([{ content: 'This is the first substantive public caption sentence for extraction. This is the second substantive public caption sentence for grounding.', language: null, locator: { chunkIndex: 0, startMs: 0, endMs: 4_500 } }]);
  });

  it('does not truncate a long transcript after early derived chunks', () => {
    const cues = Array.from({ length: 40 }, (_, index) => ({ text: `Caption ${index} ${'x'.repeat(1_000)}`, startMs: index * 1_000, endMs: (index + 1) * 1_000 }));
    const windows = chunkCaptionSegments(cues);
    expect(windows.length).toBeGreaterThan(10);
    expect(windows.map((window) => window.content).join(' ')).toContain('Caption 39');
  });

  it('rejects malformed WebVTT times and duplicate adjacent cues', () => {
    expect(parseWebVtt(`WEBVTT\n\nbad --> 00:00:02.000\nIgnored\n\n00:00:00.000 --> 00:00:01.000\nRepeated cue\n\n00:00:01.000 --> 00:00:02.000\nRepeated cue`)).toEqual([{ text: 'Repeated cue', startMs: 0, endMs: 1_000 }]);
  });

  it('prefers manual Hindi captions before automatic English fallbacks', () => {
    const tracks = captionTracks({ en: [{ ext: 'vtt' }] }, 'automatic').concat(captionTracks({ hi: [{ ext: 'vtt' }] }, 'manual'));
    expect(orderCaptionTracks(tracks, 'hi').map((track) => `${track.kind}:${track.language}`)).toEqual(['manual:hi', 'automatic:en']);
  });

  it('classifies operational failures separately from terminal no-caption outcomes', () => {
    expect(classifyYtDlpFailure(new Error('HTTP Error 429: Too Many Requests'))).toBe('yt_dlp_rate_limited');
    expect(classifyYtDlpFailure(new Error('socket timed out'))).toBe('network_failed');
  });

  it('uses the public automatic-caption writer with a Windows-safe argument array', () => {
    const args = buildCaptionDownloadArgs({ language: 'en-orig', kind: 'automatic', format: 'vtt' }, 'C:\\Temp Folder\\item-%(id)s.%(ext)s', 'https://www.youtube.com/watch?v=video');
    expect(args).toEqual(['--skip-download', '--no-warnings', '--no-playlist', '--write-auto-subs', '--sub-langs', 'en-orig', '--sub-format', 'vtt', '--output', 'C:\\Temp Folder\\item-%(id)s.%(ext)s', 'https://www.youtube.com/watch?v=video']);
  });

  it('retains manual subtitle support and does not treat JavaScript-runtime warnings as network failures', () => {
    expect(buildCaptionDownloadArgs({ language: 'hi', kind: 'manual', format: 'vtt' }, 'output', 'url')).toContain('--write-subs');
    expect(classifyYtDlpFailure(new Error('No supported JavaScript runtime could be found'))).toBe('unknown_failure');
    expect(classifyYtDlpFailure(new Error('WinError 10013: access permissions'))).toBe('network_failed');
  });

  it('keeps PO-provider arguments separate from normal caption flags and classifies provider failures safely', () => {
    expect(buildCaptionDownloadArgs({ language: 'en-orig', kind: 'automatic', format: 'vtt' }, 'output', 'url', ['--js-runtimes', 'node'])).toEqual(expect.arrayContaining(['--js-runtimes', 'node', '--write-auto-subs', '--sub-langs', 'en-orig']));
    expect(classifyYtDlpFailure(new Error('youtubepot bgutil provider failed'))).toBe('po_provider_execution_failed');
  });

  it('preserves the failure layer when YouTube rate limits after a provider is mentioned', () => {
    expect(classifyYtDlpFailure(Object.assign(new Error('command failed'), { stderr: 'bgutil provider selected; HTTP Error 429: Too Many Requests' }))).toBe('yt_dlp_rate_limited');
    expect(classifyYtDlpFailure(Object.assign(new Error('command failed'), { stderr: 'Sign in to confirm you are not a bot; bgutil provider selected' }))).toBe('youtube_bot_challenge');
    expect(classifyYtDlpFailure(Object.assign(new Error('command failed'), { stderr: 'No such provider youtubepot-bgutilscript' }))).toBe('po_provider_not_detected');
  });

  it('reduces subprocess output to safe categories without retaining tokens, cookies, or raw bodies', () => {
    expect(classifyProcessOutput('No supported JavaScript runtime could be found')).toBe('js_runtime_warning');
    expect(classifyProcessOutput('HTTP Error 429: Too Many Requests')).toBe('rate_limited');
    const detail = processFailureDetail(Object.assign(new Error('failed'), { stdout: 'token=do-not-log', stderr: 'cookie=do-not-log', code: 1 }));
    expect(detail).toMatchObject({ exitCode: 1 });
    expect(classifyProcessOutput(detail.stderr)).toBe('other');
  });

  it('redacts credential-bearing arguments and external provider locations before diagnostics are emitted', () => {
    expect(sanitizeYtDlpArgs(['--po-token', 'secret-value', '--cookies', 'cookies.txt', '--extractor-args', 'youtubepot-bgutilscript:server_home=C:\\external-provider', 'https://www.youtube.com/watch?v=public-video'])).toEqual(['--po-token', '[redacted]', '--cookies', '[redacted]', '--extractor-args', 'youtubepot-bgutilscript:server_home=[configured]', 'https://www.youtube.com/watch?v=public-video']);
  });

  it('prioritizes en-orig and bounds automatic attempts instead of walking every translated track', () => {
    const tracks = ['fr', 'en', 'en-orig', 'hi', 'de', 'es', 'pt', 'ar', 'ja'].map((language) => ({ language, kind: 'automatic' as const, format: 'vtt' }));
    expect(selectCaptionTracks(tracks, 'fa').map((track) => track.language)).toEqual(['en-orig', 'en', 'hi', 'ar', 'de', 'es']);
  });

  it('uses youtube-transcript-api first by default and does not invoke yt-dlp after a complete result', async () => {
    const previous = process.env.YOUTUBE_TRANSCRIPT_PROVIDER;
    delete process.env.YOUTUBE_TRANSCRIPT_PROVIDER;
    const acquirer = acquirerForRoutingTests();
    const primary = jest.spyOn(acquirer, 'acquireWithYoutubeTranscriptApi').mockResolvedValue(availableEvidence);
    const fallback = jest.spyOn(acquirer, 'acquireWithYtDlp').mockResolvedValue(retryableEvidence);

    await expect(acquirer.acquireTranscript('https://www.youtube.com/watch?v=video')).resolves.toEqual(availableEvidence);
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.YOUTUBE_TRANSCRIPT_PROVIDER; else process.env.YOUTUBE_TRANSCRIPT_PROVIDER = previous;
  });

  it('uses yt-dlp only as a fallback after a retryable primary result', async () => {
    const previous = process.env.YOUTUBE_TRANSCRIPT_PROVIDER;
    delete process.env.YOUTUBE_TRANSCRIPT_PROVIDER;
    const acquirer = acquirerForRoutingTests();
    jest.spyOn(acquirer, 'acquireWithYoutubeTranscriptApi').mockResolvedValue(retryableEvidence);
    const fallback = jest.spyOn(acquirer, 'acquireWithYtDlp').mockResolvedValue(availableEvidence);

    await expect(acquirer.acquireTranscript('https://www.youtube.com/watch?v=video')).resolves.toEqual(availableEvidence);
    expect(fallback).toHaveBeenCalledTimes(1);
    if (previous === undefined) delete process.env.YOUTUBE_TRANSCRIPT_PROVIDER; else process.env.YOUTUBE_TRANSCRIPT_PROVIDER = previous;
  });

  it('keeps yt-dlp as an explicit local override and resolves configured Python without hardcoding it', () => {
    expect(transcriptProviderOrder({})).toEqual(['youtube-transcript-api', 'yt-dlp']);
    expect(transcriptProviderOrder({ YOUTUBE_TRANSCRIPT_PROVIDER: 'yt-dlp' })).toEqual(['yt-dlp']);
    expect(youtubeTranscriptPythonExecutable({ YOUTUBE_TRANSCRIPT_PYTHON: 'C:\\Python311\\python.exe' })).toBe('C:\\Python311\\python.exe');
  });

  it('passes a configured Windows Python path safely and inherits the provider environment', () => {
    const environment = { YOUTUBE_TRANSCRIPT_PYTHON: 'C:\\Users\\diamond\\AppData\\Local\\Programs\\Python\\Python311\\python.exe', HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'localhost' };
    const options = youtubeTranscriptApiExecutionOptions(environment, 'D:\\Social media\\content-os\\apps\\api');
    expect(youtubeTranscriptPythonExecutable(environment)).toBe(environment.YOUTUBE_TRANSCRIPT_PYTHON);
    expect(options).toMatchObject({ shell: false, cwd: 'D:\\Social media\\content-os\\apps\\api', timeout: 45_000, env: { HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'localhost', PYTHONIOENCODING: 'utf-8' } });
  });

  it('normalizes successful timestamped JSON output without losing Hindi Unicode', () => {
    const parsed = parseYoutubeTranscriptApiOutput(JSON.stringify({ language: 'hi', captionType: 'automatic', segments: [{ text: 'नमस्कार, मैं हूं प्रशांत धवन।', startMs: 4_000, endMs: 7_000 }] }));
    expect(parsed).toEqual({ language: 'hi', captionType: 'automatic', segments: [{ text: 'नमस्कार, मैं हूं प्रशांत धवन।', startMs: 4_000, endMs: 7_000 }] });
  });

  it('classifies timeout, nonzero runtime, and network process failures without exposing stderr', () => {
    expect(classifyYoutubeTranscriptApiFailure(Object.assign(new Error('Command timed out after 45000 milliseconds'), { code: null }))).toMatchObject({ code: 'youtube_transcript_api_timeout', reason: 'provider_timed_out', diagnostic: { stderrSummary: 'empty' } });
    expect(classifyYoutubeTranscriptApiFailure(Object.assign(new Error('Command failed'), { code: 1, stderr: 'Traceback: import failed' }))).toMatchObject({ code: 'youtube_transcript_api_runtime_failed', reason: 'provider_process_failed', diagnostic: { exitCode: 1, stderrSummary: 'other' } });
    expect(classifyYoutubeTranscriptApiFailure(new Error('WinError 10013: access permissions'))).toMatchObject({ code: 'network_failed', reason: 'provider_network_failed' });
    expect(isRetryable('youtube_transcript_api_timeout')).toBe(true);
  });
});
