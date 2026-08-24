import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SpeechToTextProvider } from './jarvis.types';

@Injectable()
export class LocalWhisperProvider implements SpeechToTextProvider {
  readonly id = 'whisper-cpp';
  async transcribe(input: { audio: Buffer; mimeType: string; language?: string }) {
  const baseUrl = process.env.LOCAL_WHISPER_URL?.trim();

  if (!baseUrl) {
    throw new ServiceUnavailableException(
      'Local speech recognition is not configured.',
    );
  }

  const form = new FormData();

  form.append(
    'file',
    new Blob([Uint8Array.from(input.audio)], {
      type: input.mimeType || 'audio/wav',
    }),
    'jarvis-audio.wav',
  );

  form.append('response_format', 'json');

  if (input.language) {
    form.append('language', input.language);
  }

  let response: Response;

  try {
    response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/inference`,
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new ServiceUnavailableException(
      'Local speech recognition is unavailable.',
    );
  }

  if (!response.ok) {
    throw new ServiceUnavailableException(
      'Local speech recognition is unavailable.',
    );
  }

  const body = (await response.json()) as {
    text?: unknown;
    language?: unknown;
    durationMs?: unknown;
  };

  const text =
    typeof body.text === 'string'
      ? body.text.trim()
      : '';

  if (!text) {
    throw new ServiceUnavailableException(
      'Local speech recognition returned no text.',
    );
  }

  return {
    text,
    language:
      typeof body.language === 'string'
        ? body.language
        : null,
    durationMs:
      typeof body.durationMs === 'number'
        ? body.durationMs
        : null,
    provider: this.id,
  };
}
}
