import type { VoiceDirection } from '@content-os/contracts';

export type AudioProviderCapabilities = {
  emotion: boolean;
  intensity: boolean;
  speakingRate: boolean;
  pitchDirection: boolean;
  emphasisWords: boolean;
  pauses: boolean;
  nonVerbalEvents: boolean;
  pronunciationOverrides: boolean;
};

export type AudioLanguageSupport = {
  production: readonly string[];
  previewOnly: readonly string[];
};

export type AudioCapabilityDegradation = {
  control: string;
  status: 'unsupported' | 'manual_review_only' | 'technical_preview';
  reason: string;
};

export type AudioProviderConfiguration = {
  provider: string;
  model: string;
  modelVersion: string;
  modelRevision: string;
  protocolVersion: string;
  voiceId: string;
  outputDirectory: string;
  timeoutMs: number;
  languageModes: Record<string, string>;
  capabilities: AudioProviderCapabilities;
  expressionTags: readonly string[];
  selectableVoiceIds: readonly string[];
  languageSupport: AudioLanguageSupport;
  degradations: readonly AudioCapabilityDegradation[];
  /** Request/render parameters that affect reproducible audio output. */
  renderStrategyVersion?: string;
  outputConfiguration?: Readonly<Record<string, string | number | boolean>>;
};

export type AudioSynthesisSegment = {
  segmentId: string;
  sceneId: string;
  sceneIndex: number;
  narration: string;
  language: string;
  voiceDirection: VoiceDirection;
};

export type AudioSynthesisRequest = {
  segment: AudioSynthesisSegment;
  outputPath: string;
};

export type AudioSynthesisResult = {
  segmentId: string;
  actualDurationMs: number;
  audioPath: string;
  telemetry?: { keyAlias: string; providerRequestId: string | null; inputCharacters: number; outputBytes: number; elapsedMs: number; attempt: number; rotated: boolean };
};

export interface AudioProvider {
  readonly id: string;
  configuration(): AudioProviderConfiguration;
  synthesize(request: AudioSynthesisRequest): Promise<AudioSynthesisResult>;
}
