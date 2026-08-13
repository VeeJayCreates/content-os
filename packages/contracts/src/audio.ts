import type {
  AudioGenerationStatus,
  AudioSegmentStatus,
  VoiceEmotion,
  VoiceIntensity,
  VoiceNonVerbalEvent,
  VoicePitchDirection,
  VoiceSpeakingRate,
} from './enums.js';

export interface VoiceDirection {
  emotion: VoiceEmotion;
  intensity: VoiceIntensity;
  speakingRate: VoiceSpeakingRate;
  pitchDirection: VoicePitchDirection;
  emphasisWords: string[];
  pauseBeforeMs: number;
  pauseAfterMs: number;
  nonVerbalEvent: VoiceNonVerbalEvent | null;
  pronunciationOverrides: Record<string, string>;
  manualReview: boolean;
}

export interface AudioGeneration {
  id: string;
  projectId: string;
  contentScriptId: string;
  scenePlanId: string;
  provider: string;
  model: string;
  modelVersion: string;
  voiceId: string;
  language: string;
  status: AudioGenerationStatus;
  inputHash: string;
  totalDurationMs: number | null;
  outputPath: string | null;
  outputMetadata: Record<string, unknown> | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  segments: AudioSegment[];
}

export interface AudioSegment {
  id: string;
  audioGenerationId: string;
  sceneId: string;
  sceneIndex: number;
  narration: string;
  language: string;
  actualDurationMs: number | null;
  startMs: number | null;
  endMs: number | null;
  audioPath: string | null;
  voiceDirection: VoiceDirection;
  status: AudioSegmentStatus;
  createdAt: string;
  updatedAt: string;
}
