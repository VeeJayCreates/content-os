import { Injectable } from '@nestjs/common';

export type AudioGenerationLimits = { maxSegments: number; maxCharactersPerSegment: number; maxCharactersPerGeneration: number };

@Injectable()
export class AudioRuntimeConfiguration {
  limits(): AudioGenerationLimits { return { maxSegments: this.positive('AUDIO_MAX_SEGMENTS_PER_GENERATION', 50, 500), maxCharactersPerSegment: this.positive('AUDIO_MAX_CHARACTERS_PER_SEGMENT', 2500, 2500), maxCharactersPerGeneration: this.positive('AUDIO_MAX_CHARACTERS_PER_GENERATION', 50_000, 250_000) }; }
  private positive(name: string, fallback: number, maximum: number) { const raw = process.env[name]; if (raw === undefined || raw.trim() === '') return fallback; const value = Number(raw); if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new Error(`${name} must be a positive integer within supported bounds`); return value; }
}
