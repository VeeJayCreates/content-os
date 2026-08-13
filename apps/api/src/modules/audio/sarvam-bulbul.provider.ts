import { writeFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { AudioProvider, AudioSynthesisRequest, AudioSynthesisResult } from './audio-runtime.types';
import { validateWav } from './wav-validation';
import { SARVAM_BULBUL_PROVIDER_ID, SarvamBulbulConfiguration } from './sarvam-bulbul.configuration';

export class SarvamAudioProviderError extends Error {
  constructor(readonly category: string, message = 'Sarvam audio generation failed') { super(message); }
}
const safe = (category: string, message?: string) => new SarvamAudioProviderError(category, message);
/**
 * Bulbul V3 accepts Hindi/Hinglish source text directly. Keeping this explicit
 * prevents a future pronunciation transform from silently changing narration.
 */
export const deriveSarvamProviderRenderText = (sourceNarration: string) => sourceNarration;
const retryAfterMs = (value: string | null, fallback: number, now = Date.now()) => { const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 300_000); const date = value ? Date.parse(value) : Number.NaN; return Number.isFinite(date) && date > now ? Math.min(date - now, 300_000) : fallback; };
@Injectable()
export class SarvamBulbulAudioProvider implements AudioProvider {
  readonly id = SARVAM_BULBUL_PROVIDER_ID;
  private readonly logger = new Logger(SarvamBulbulAudioProvider.name);
  constructor(private readonly configurationResolver: SarvamBulbulConfiguration) {}
  configuration() { return this.configurationResolver.resolve(); }
  async synthesize(request: AudioSynthesisRequest): Promise<AudioSynthesisResult> {
    const cfg = this.configuration(); const language = cfg.languageModes[request.segment.language];
    if (!language || !cfg.languageSupport.production.includes(request.segment.language)) throw safe('unsupported_language');
    const providerRenderText = deriveSarvamProviderRenderText(request.segment.narration);
    if (providerRenderText.length === 0 || providerRenderText.length > cfg.maxCharacters) throw safe('request_validation');
    const root = resolve(cfg.outputDirectory); const target = resolve(request.outputPath);
    if (!target.startsWith(`${root}${sep}`) || basename(target) !== `${request.segment.segmentId}.wav`) throw safe('output_path_validation');
    const used = new Set<string>(); let lastCategory = 'provider_unavailable';
    for (let attempt = 1; attempt <= Math.min(cfg.maxAttempts, cfg.keys.size); attempt += 1) {
      const lease = cfg.keys.lease(attempt, used); if (!lease) break; used.add(lease.alias); const started = Date.now();
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
      try {
        const response = await fetch(`${cfg.baseUrl}/text-to-speech`, { method: 'POST', headers: { 'content-type': 'application/json', 'api-subscription-key': lease.secret }, body: JSON.stringify({ text: providerRenderText, language_code: language, speaker: cfg.voiceId, pace: cfg.pace, temperature: cfg.temperature, speech_sample_rate: cfg.sampleRate, model: cfg.model, output_audio_codec: cfg.codec }), signal: controller.signal });
        const requestId = response.headers.get('x-request-id') ?? null;
        if (!response.ok) {
          const status = response.status; lastCategory = status === 429 ? 'rate_limited' : status === 401 || status === 403 ? 'authentication' : 'provider_rejected';
          if (status === 429) { cfg.keys.cooldown(lease.alias, retryAfterMs(response.headers.get('retry-after'), cfg.cooldownMs)); this.warn({ stage: lastCategory, status, alias: lease.alias, attempt }); continue; }
          if (status === 401 || status === 403) { cfg.keys.disable(lease.alias); this.warn({ stage: lastCategory, status, alias: lease.alias, attempt }); continue; }
          this.warn({ stage: lastCategory, status, alias: lease.alias, attempt }); throw safe(lastCategory);
        }
        const body: unknown = await response.json(); const audios = body && typeof body === 'object' ? Reflect.get(body, 'audios') : undefined; const bodyRequestId = body && typeof body === 'object' ? Reflect.get(body, 'request_id') : undefined;
        if (!Array.isArray(audios) || audios.length !== 1 || typeof audios[0] !== 'string') { this.warn({ stage: 'malformed_response', status: 200, alias: lease.alias, attempt }); throw safe('malformed_response'); }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audios[0]) || audios[0].length % 4 !== 0) throw safe('malformed_audio');
        const audio = Buffer.from(audios[0], 'base64'); if (audio.length === 0 || audio.length > 50 * 1024 * 1024) throw safe('audio_bounds'); const wav = validateWav(audio);
        await writeFile(target, audio, { flag: 'wx' });
        return { segmentId: request.segment.segmentId, actualDurationMs: wav.durationMs, audioPath: target, telemetry: { keyAlias: lease.alias, providerRequestId: typeof bodyRequestId === 'string' ? bodyRequestId.slice(0, 100) : requestId, inputCharacters: providerRenderText.length, outputBytes: audio.length, elapsedMs: Date.now() - started, attempt, rotated: lease.rotated } };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') { this.warn({ stage: 'timeout', status: null, alias: lease.alias, attempt }); throw safe('timeout'); }
        if (error instanceof TypeError) { this.warn({ stage: 'network', status: null, alias: lease.alias, attempt }); throw safe('network'); }
        throw error;
      } finally { clearTimeout(timer); }
    }
    this.warn({ stage: lastCategory, status: null, alias: null, attempt: used.size }); throw safe(lastCategory, 'Sarvam audio provider unavailable');
  }
  health() { const cfg = this.configuration(); return { configured: cfg.keys.size > 0, provider: cfg.provider, model: cfg.model, keyCount: cfg.keys.size, keys: cfg.keys.health() }; }
  private warn(value: Record<string, unknown>) { this.logger.warn(JSON.stringify({ event: 'sarvam_audio_failure', provider: this.id, ...value })); }
}
