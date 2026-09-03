#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { aggregateAttempts, attemptKey, classifyCompleteness, classifyProviderFailure, emptyBenchmark, inputFingerprint, isLiveExecutionAuthorized, normalizeVideoId } from './benchmark-core.mjs';
import { contentOsPoProviderArgs, localAvailability, providerCatalog, runProvider } from './provider-runners.mjs';

const args = parseArgs(process.argv.slice(2));
const inputPath = resolve(args.input ?? fileURLToPath(new URL('./videos.json', import.meta.url)));
const outputPath = resolve(args.output ?? fileURLToPath(new URL('./output/transcript-provider-benchmark.json', import.meta.url)));
const providers = (args.providers ?? Object.keys(providerCatalog).join(',')).split(',').filter(Boolean);
const paceMs = boundedNumber(args['pace-ms'], 12_000, 1_000, 120_000);
const limit = boundedNumber(args.limit, Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER);
const videos = JSON.parse(await readFile(inputPath, 'utf8')).map((video) => ({ ...video, videoId: normalizeVideoId(video.videoId) })).slice(0, limit);
let state = await readState(outputPath, providers, videos, paceMs, args.phase ?? 'phase-3');
const available = Object.fromEntries(await Promise.all(providers.map(async (provider) => [provider, await localAvailability(provider)])));
if (args.preflight === 'true' || args['preflight-only'] === 'true') {
  await persist(outputPath, { ...state, availability: available, aggregates: aggregateAttempts(state.attempts) });
  console.log(JSON.stringify({ status: 'preflight_complete', availability: available, outputPath }, null, 2));
  process.exit(0);
}
if (!isLiveExecutionAuthorized(args)) throw new Error('live_benchmark_requires_explicit_--live=true');
let paused = false;
for (const provider of providers) {
  if (!available[provider]?.available) continue;
  for (const video of videos) {
    if (state.attempts.some((attempt) => attemptKey(attempt) === `${provider}:${video.videoId}` && attempt.inputFingerprint === inputFingerprint(video))) continue;
    const startedAt = Date.now();
    let attempt;
    try {
      const result = await runProvider(provider, video, { ytDlpArgs: contentOsPoProviderArgs() });
      const complete = classifyCompleteness({ outcome: 'success', segments: result.segments, videoDurationMs: video.videoDurationMs ?? null });
      attempt = { provider, videoId: video.videoId, source: video.source ?? null, channel: video.channel ?? null, inputFingerprint: inputFingerprint(video), outcome: 'success', language: result.language ?? null, captionType: result.captionType ?? null, durationMs: Date.now() - startedAt, completeness: complete.classification, completenessReason: complete.reason, metrics: complete.metrics, failureClassification: null, attemptedAt: new Date().toISOString() };
    } catch (error) {
      const failureClassification = classifyProviderFailure(error);
      const complete = classifyCompleteness({ outcome: failureClassification === 'no_captions' ? 'no_captions' : 'failure', segments: [], videoDurationMs: video.videoDurationMs ?? null });
      attempt = { provider, videoId: video.videoId, source: video.source ?? null, channel: video.channel ?? null, inputFingerprint: inputFingerprint(video), outcome: 'failure', language: null, captionType: null, durationMs: Date.now() - startedAt, completeness: complete.classification, completenessReason: complete.reason, metrics: complete.metrics, failureClassification, attemptedAt: new Date().toISOString() };
    }
    state = { ...state, updatedAt: new Date().toISOString(), attempts: [...state.attempts.filter((item) => attemptKey(item) !== attemptKey(attempt)), attempt], availability: available };
    await persist(outputPath, { ...state, aggregates: aggregateAttempts(state.attempts) });
    console.log(JSON.stringify({ provider, videoId: video.videoId, completeness: attempt.completeness, failureClassification: attempt.failureClassification, durationMs: attempt.durationMs }));
    if (attempt.failureClassification === 'rate_limited' || attempt.failureClassification === 'bot_challenge') { console.error('Benchmark paused after YouTube protection response.'); process.exitCode = 2; paused = true; break; }
    await sleep(paceMs);
  }
  if (paused) break;
}
console.log(JSON.stringify({ status: paused ? 'paused' : 'complete', aggregates: aggregateAttempts(state.attempts), outputPath }, null, 2));

async function readState(outputPath, providers, videos, paceMs, phase) { try { return JSON.parse(await readFile(outputPath, 'utf8')); } catch { return emptyBenchmark({ providers, videos, paceMs, phase }); } }
async function persist(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function parseArgs(values) { return Object.fromEntries(values.filter((value) => value.startsWith('--')).map((value) => { const [key, raw = 'true'] = value.slice(2).split('=', 2); return [key, raw]; })); }
function boundedNumber(value, fallback, minimum, maximum) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
