# ContentOS Transcript Provider Benchmark

This isolated tool benchmarks transcript acquisition providers without importing the API, touching ContentOS databases, or changing production provider selection. It runs sequentially, checkpoints each provider/video attempt, and stops immediately after a rate-limit or bot-challenge response.

## Run safely

Use a clean YouTube runtime window and begin with the single reference video:

```powershell
node tools/transcript-provider-benchmark/run.mjs --phase=phase-2 --preflight=true
node tools/transcript-provider-benchmark/run.mjs --live=true --phase=phase-2 --providers=contentos-yt-dlp,jdepoix-youtube-transcript-api,rapha30-yt-youtube-transcript,nadimtuhin-ytranscript --pace-ms=12000
```

The checkpoint is `tools/transcript-provider-benchmark/output/transcript-provider-benchmark.json`; rerunning the same command resumes safely. Supply a JSON array of real corpus videos through `--input=...` for Phase 3 (about 20) and Phase 4 (100–200). Each entry must contain `videoId`; `source`, `channel`, and `videoDurationMs` are optional but duration is required to classify a transcript as **complete** rather than **unknown**.

Render the human-readable comparison from the persisted checkpoint with:

```powershell
node tools/transcript-provider-benchmark/render-report.mjs
```

No proxy, cookie, account, VPN, retry loop, or concurrency setting above one is supported by this harness.

## Completeness policy

The benchmark does not equate a successful command with a usable transcript. It reports `complete` only with sufficient content and trusted duration coverage. A ten-minute video whose transcript starts near minute nine and contains only an end advertisement is `incomplete`. When duration is absent, an otherwise substantial result remains `unknown`.

## Providers audited

| Provider | Runtime | Timestamped output | Local requirement |
| --- | --- | --- | --- |
| ContentOS yt-dlp | Python executable | VTT | `yt-dlp` |
| rapha30/yt-youtube-transcript | Go executable | SRT | `yt-transcript` |
| jdepoix/youtube-transcript-api | Python module | segments | `youtube_transcript_api` |
| nadimtuhin/ytranscript | Node executable | JSON segments | `ytranscript` |

The tool detects missing local executables/modules and records them as unavailable rather than downloading or invoking package managers.

The default command cannot acquire a transcript. Live acquisition requires the explicit `--live=true` switch; `--preflight=true` only executes local version/help/module checks.

For the `contentos-yt-dlp` candidate, the harness mirrors the non-secret configured ContentOS PO-provider arguments when `YOUTUBE_PO_TOKEN_PROVIDER_ENABLED=true`; it never reads cookies, keys, or token values.

## Local preparation

The tracked [provider-preparation.json](./provider-preparation.json) records the prepared versions. The isolated `@nadimtuhin/ytranscript` install is under `.local/transcript-provider-benchmark/ytranscript` and is ignored by Git. To prepare rapha30 later, install its official CLI using a local Go toolchain, then set `TRANSCRIPT_BENCHMARK_RAPHA_EXECUTABLE` to that executable before running preflight. The harness never invokes package managers itself.
