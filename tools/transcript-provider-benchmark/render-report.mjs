#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = resolve(process.argv[2] ?? fileURLToPath(new URL('./output/transcript-provider-benchmark.json', import.meta.url)));
const report = resolve(process.argv[3] ?? fileURLToPath(new URL('./output/TRANSCRIPT_PROVIDER_BENCHMARK.md', import.meta.url)));
const result = JSON.parse(await readFile(output, 'utf8'));
const rows = Object.entries(result.aggregates ?? {}).map(([provider, value]) => `| ${provider} | ${value.attempted} | ${value.complete} | ${value.incomplete} | ${value.unknown} | ${value.noCaptions} | ${value.operationalFailures} | ${value.rateLimited} | ${value.botChallenges} | ${format(value.averageLatencyMs)} | ${format(value.p50LatencyMs)} | ${format(value.p95LatencyMs)} |`).join('\n') || '| _No live attempts yet_ | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | — |';
const markdown = `# Transcript Provider Benchmark\n\nGenerated: ${new Date().toISOString()}\n\nPhase: ${result.phase ?? 'unknown'}  \nConcurrency: ${result.configuration?.concurrency ?? 1}  \nPace: ${result.configuration?.paceMs ?? 'unknown'} ms\n\n## Results\n\n| Provider | Attempts | Complete | Incomplete | Unknown | No captions | Operational failures | Rate limited | Bot challenge | Average ms | P50 ms | P95 ms |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\n## Decision\n\nNo primary or fallback provider is selected until Phase 3 and Phase 4 record meaningful complete-transcript results. A returned response is not sufficient: only the complete classification counts toward reliability.\n`;
await mkdir(dirname(report), { recursive: true });
await writeFile(report, markdown, 'utf8');
console.log(report);
function format(value) { return Number.isFinite(value) ? String(value) : '—'; }
