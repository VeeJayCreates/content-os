import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { normalizeSegments } from './benchmark-core.mjs';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 45_000;

export const providerCatalog = Object.freeze({
  'contentos-yt-dlp': { repository: 'https://github.com/yt-dlp/yt-dlp', runtime: 'Python executable', executable: 'yt-dlp', timestamps: true, supportsAuto: true, supportsManual: true, supportsTranslation: true },
  'rapha30-yt-youtube-transcript': { repository: 'https://github.com/rapha30/yt-youtube-transcript', runtime: 'Go executable', executable: 'yt-transcript', timestamps: true, supportsAuto: true, supportsManual: true, supportsTranslation: true },
  'jdepoix-youtube-transcript-api': { repository: 'https://github.com/jdepoix/youtube-transcript-api', runtime: 'Python module', executable: 'python', timestamps: true, supportsAuto: true, supportsManual: true, supportsTranslation: true },
  'nadimtuhin-ytranscript': { repository: 'https://github.com/nadimtuhin/ytranscript', runtime: 'Node executable', executable: 'ytranscript', timestamps: true, supportsAuto: true, supportsManual: true, supportsTranslation: false },
});

export async function localAvailability(provider) {
  const item = providerCatalog[provider];
  if (!item) return { available: false, reason: 'unknown_provider' };
  if (provider === 'jdepoix-youtube-transcript-api') {
    try { const result = await execute('python', ['-c', 'import importlib.metadata; print(importlib.metadata.version("youtube-transcript-api"))']); return { available: true, reason: null, executable: 'python', version: result.stdout.trim(), runtimeReady: true }; } catch { return { available: false, reason: 'python_module_not_installed', executable: 'python', version: null, runtimeReady: false }; }
  }
  if (provider === 'nadimtuhin-ytranscript') return localYTranscriptAvailability();
  if (provider === 'rapha30-yt-youtube-transcript') return localRaphaAvailability();
  try { const result = await execute(item.executable, ['--version']); return { available: true, reason: null, executable: item.executable, version: result.stdout.trim(), runtimeReady: true }; } catch { return { available: false, reason: 'executable_not_installed', executable: item.executable, version: null, runtimeReady: false }; }
}

export async function runProvider(provider, video, options = {}) {
  if (provider === 'contentos-yt-dlp') return runYtDlp(video, options.ytDlpArgs ?? []);
  if (provider === 'rapha30-yt-youtube-transcript') return runRapha(video, options.raphaExecutable);
  if (provider === 'jdepoix-youtube-transcript-api') return runPythonApi(video);
  if (provider === 'nadimtuhin-ytranscript') return runYTranscript(video, options.ytranscriptExecutable);
  throw new Error('unknown_provider');
}

export function contentOsPoProviderArgs(environment = process.env) {
  if (environment.YOUTUBE_PO_TOKEN_PROVIDER_ENABLED?.trim().toLowerCase() !== 'true') return [];
  const runtime = environment.YOUTUBE_JS_RUNTIME?.trim() || 'node';
  const mode = environment.YOUTUBE_PO_TOKEN_PROVIDER_MODE?.trim().toLowerCase();
  if (mode === 'script' && environment.YOUTUBE_PO_TOKEN_PROVIDER_PATH?.trim()) return ['--js-runtimes', runtime, '--extractor-args', `youtubepot-bgutilscript:server_home=${environment.YOUTUBE_PO_TOKEN_PROVIDER_PATH.trim()}`];
  if (mode === 'http' && environment.YOUTUBE_PO_TOKEN_PROVIDER_URL?.trim()) return ['--js-runtimes', runtime, '--extractor-args', `youtubepot-bgutilhttp:base_url=${environment.YOUTUBE_PO_TOKEN_PROVIDER_URL.trim()}`];
  return [];
}

async function runYtDlp(video, providerArgs) {
  return withTempDirectory('content-os-transcript-benchmark-', async (directory) => {
    await execute('yt-dlp', [...providerArgs, '--skip-download', '--no-warnings', '--no-playlist', '--write-auto-subs', '--sub-langs', 'en-orig,en,hi', '--sub-format', 'vtt', '--output', join(directory, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${video.videoId}`]);
    const vtt = (await readdir(directory)).find((name) => name.endsWith('.vtt'));
    if (!vtt) throw new Error('caption_file_not_created');
    return { language: vtt.split('.').at(-2) ?? null, captionType: 'automatic', segments: normalizeYtDlpVtt(await readFile(join(directory, vtt), 'utf8')) };
  });
}

async function runRapha(video, executable = process.env.TRANSCRIPT_BENCHMARK_RAPHA_EXECUTABLE ?? 'yt-transcript') {
  return withTempDirectory('content-os-transcript-benchmark-', async (directory) => {
    await execute(executable, ['-out', directory, '-srt', video.videoId]);
    const srt = (await readdir(directory)).find((name) => name.endsWith('.srt'));
    if (!srt) throw new Error('caption_file_not_created');
    return { language: null, captionType: 'provider_selected', segments: normalizeRaphaSrt(await readFile(join(directory, srt), 'utf8')) };
  });
}

async function runPythonApi(video) {
  return withTempDirectory('content-os-transcript-benchmark-', async (directory) => {
    const input = join(directory, 'input.json'); const output = join(directory, 'output.json');
    await writeFile(input, JSON.stringify({ videoId: video.videoId }), 'utf8');
    await execute('python', [fileURLToPath(new URL('./youtube-transcript-api-runner.py', import.meta.url)), input, output]);
    return normalizeYoutubeTranscriptApiOutput(JSON.parse(await readFile(output, 'utf8')));
  });
}

async function runYTranscript(video, executable = localYTranscriptEntry()) {
  if (!executable) throw new Error('ytranscript_executable_not_installed');
  const { stdout } = await execute('node', [executable, 'get', video.videoId, '--format', 'json']);
  const parsed = JSON.parse(stdout);
  return normalizeYTranscriptOutput(parsed);
}

async function execute(executable, args) { return execFileAsync(executable, args, { windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 }); }
async function withTempDirectory(prefix, callback) { const directory = await mkdtemp(join(tmpdir(), prefix)); try { return await callback(directory); } finally { await rm(directory, { recursive: true, force: true }); } }
export function normalizeYtDlpVtt(value) { return parseSubtitle(value); }
export function normalizeRaphaSrt(value) { return parseSubtitle(value); }
export function normalizeYoutubeTranscriptApiOutput(value) { return { language: typeof value?.language === 'string' ? value.language : null, captionType: value?.captionType === 'automatic' ? 'automatic' : 'manual', segments: normalizeSegments(value?.segments) }; }
export function normalizeYTranscriptOutput(value) { return { language: typeof value?.language === 'string' ? value.language : null, captionType: value?.isAutoGenerated ? 'automatic' : 'manual', segments: normalizeSegments(value?.segments) }; }
function parseSubtitle(value) {
  const result = [];
  for (const block of value.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean); const index = lines.findIndex((line) => line.includes('-->'));
    if (index < 0) continue;
    const [start, end] = lines[index].split('-->').map((part) => timestamp(part.trim().split(/\s+/)[0] ?? ''));
    const text = lines.slice(index + 1).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (start !== null && end !== null && end > start && text) result.push({ text, startMs: start, durationMs: end - start });
  }
  return result;
}
function timestamp(value) { const parts = value.replace(',', '.').split(':'); const seconds = Number(parts.pop()); const minutes = Number(parts.pop() ?? 0); const hours = Number(parts.pop() ?? 0); return [seconds, minutes, hours].every(Number.isFinite) ? Math.round((hours * 3600 + minutes * 60 + seconds) * 1000) : null; }
function localYTranscriptEntry() { return process.env.TRANSCRIPT_BENCHMARK_YTRANSCRIPT_EXECUTABLE ?? fileURLToPath(new URL('../../.local/transcript-provider-benchmark/ytranscript/node_modules/@nadimtuhin/ytranscript/dist/cli.js', import.meta.url)); }
async function localYTranscriptAvailability() { const executable = localYTranscriptEntry(); try { const result = await execute('node', [executable, '--version']); return { available: true, reason: null, executable, version: result.stdout.trim(), runtimeReady: true }; } catch { return { available: false, reason: 'isolated_ytranscript_not_installed', executable, version: null, runtimeReady: false }; } }
async function localRaphaAvailability() { const executable = process.env.TRANSCRIPT_BENCHMARK_RAPHA_EXECUTABLE ?? 'yt-transcript'; try { const result = await execute(executable, ['-version']); return { available: true, reason: null, executable, version: result.stdout.trim(), runtimeReady: true }; } catch { return { available: false, reason: 'rapha_executable_not_installed_go_unavailable_docker_daemon_unavailable', executable, version: null, runtimeReady: false }; } }
