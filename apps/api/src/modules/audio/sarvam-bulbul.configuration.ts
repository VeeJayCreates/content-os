import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
import type { AudioProviderCapabilities, AudioProviderConfiguration } from './audio-runtime.types';
import { SarvamKeyPool } from './sarvam-key-pool';

export const SARVAM_BULBUL_PROVIDER_ID = 'sarvam-bulbul-v3';
export const SARVAM_BULBUL_V3_SPEAKERS = ['shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali'] as const;
const capabilities: AudioProviderCapabilities = { emotion: false, intensity: false, speakingRate: true, pitchDirection: false, emphasisWords: false, pauses: false, nonVerbalEvents: false, pronunciationOverrides: true };
@Injectable()
export class SarvamBulbulConfiguration {
  resolve(): AudioProviderConfiguration & { baseUrl: string; keys: SarvamKeyPool; maxCharacters: number; maxAttempts: number; cooldownMs: number; sampleRate: number; codec: 'wav'; pace: number; temperature: number } {
    const values = (process.env.SARVAM_API_KEYS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    const keys = new SarvamKeyPool(values);
    const sampleRate = this.sampleRate(); const pace = this.number('SARVAM_PACE', 1, 0.5, 2); const temperature = this.number('SARVAM_TEMPERATURE', 0.6, 0.01, 2);
    return { provider: SARVAM_BULBUL_PROVIDER_ID, model: 'bulbul:v3', modelVersion: 'bulbul-v3', modelRevision: 'sarvam-rest-v1', protocolVersion: 'content-os-sarvam-bulbul-v1', renderStrategyVersion: 'sarvam-source-equals-render-v1', outputConfiguration: { sampleRate, codec: this.codec(), pace, temperature }, voiceId: this.speaker(), outputDirectory: this.outputDirectory(), timeoutMs: this.integer('SARVAM_TIMEOUT_MS', 60_000, 120_000), languageModes: { Hindi: 'hi-IN', Hinglish: 'hi-IN', English: 'en-IN' }, capabilities, expressionTags: [], selectableVoiceIds: SARVAM_BULBUL_V3_SPEAKERS, languageSupport: { production: ['Hindi', 'Hinglish', 'English'], previewOnly: [] }, degradations: [{ control: 'emotion', status: 'unsupported', reason: 'Bulbul V3 does not expose deterministic emotion control.' }, { control: 'pitch', status: 'unsupported', reason: 'Bulbul V3 does not support pitch control.' }, { control: 'non_verbal_events', status: 'unsupported', reason: 'Non-verbal events are not automatic.' }], baseUrl: (process.env.SARVAM_BASE_URL?.trim() || 'https://api.sarvam.ai').replace(/\/+$/, ''), keys, maxCharacters: 2500, maxAttempts: this.integer('SARVAM_MAX_ATTEMPTS_PER_SEGMENT', Math.max(1, keys.size), Math.max(1, keys.size || 1)), cooldownMs: this.integer('SARVAM_COOLDOWN_MS', 30_000, 300_000), sampleRate, codec: this.codec(), pace, temperature };
  }
  private outputDirectory() { return process.env.AUDIO_SARVAM_OUTPUT_DIR?.trim() || resolve(process.cwd(), '.content-os-audio'); }
  private speaker() { const value = process.env.SARVAM_SPEAKER?.trim() || 'ratan'; if (!(SARVAM_BULBUL_V3_SPEAKERS as readonly string[]).includes(value)) throw new Error('SARVAM_SPEAKER must be a supported lowercase Bulbul V3 speaker'); return value; }
  private codec(): 'wav' { const value = process.env.SARVAM_OUTPUT_AUDIO_CODEC?.trim() || 'wav'; if (value !== 'wav') throw new Error('SARVAM_OUTPUT_AUDIO_CODEC must be wav for Audio Runtime V1'); return value; }
  private sampleRate() { const value = this.integer('SARVAM_SAMPLE_RATE', 24_000, 48_000); if (![8000, 16000, 22050, 24000, 32000, 44100, 48000].includes(value)) throw new Error('SARVAM_SAMPLE_RATE must be an official Bulbul V3 REST sample rate'); return value; }
  private integer(name: string, fallback: number, maximum: number) { const raw = process.env[name]; if (raw === undefined || raw.trim() === '') return fallback; const value = Number(raw); if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new Error(`${name} must be a positive integer within supported bounds`); return value; }
  private number(name: string, fallback: number, minimum: number, maximum: number) { const raw = process.env[name]; if (raw === undefined || raw.trim() === '') return fallback; const value = Number(raw); if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} must be within supported bounds`); return value; }
}
