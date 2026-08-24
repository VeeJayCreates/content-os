import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { VoiceSynthesisProvider } from './jarvis.types';

@Injectable()
export class SupertonicVoiceProvider implements VoiceSynthesisProvider {
  readonly id = 'supertonic';
  async synthesize(input: { text: string; voice?: string; language?: string }) {
    const baseUrl = process.env.SUPERTONIC_URL?.trim();
    if (!baseUrl) throw new ServiceUnavailableException('Local voice synthesis is not configured.');
    let response: Response;
    try { response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/audio/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'supertonic-3', voice: input.voice ?? process.env.JARVIS_TTS_VOICE ?? 'M1', input: input.text }), signal: AbortSignal.timeout(30_000) }); }
    catch { throw new ServiceUnavailableException('Local voice synthesis is unavailable.'); }
    if (!response.ok) throw new ServiceUnavailableException('Local voice synthesis is unavailable.');
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new ServiceUnavailableException('Local voice synthesis returned no audio.');
    return { audio, mimeType: response.headers.get('content-type') ?? 'audio/wav', durationMs: null, provider: this.id };
  }
}
