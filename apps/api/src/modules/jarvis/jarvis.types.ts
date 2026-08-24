import type { SpeechTranscription } from '@content-os/contracts';

export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(input: { audio: Buffer; mimeType: string; language?: string }): Promise<SpeechTranscription>;
}

export interface VoiceSynthesisProvider {
  readonly id: string;
  synthesize(input: { text: string; voice?: string; language?: string }): Promise<{ audio: Buffer; mimeType: string; durationMs: number | null; provider: string }>;
}
