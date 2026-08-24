"use client";
import * as React from 'react';
import type { JarvisOperationalResponse, JarvisVoiceState } from '@content-os/contracts';
import { queryJarvis, synthesizeJarvis, transcribeJarvisAudio } from '../api/jarvis-client';
import { COMMAND_MAX_MS, COMMAND_MIN_MS, COMMAND_SILENCE_MS, encodePcm16Wav } from './command-audio';
import { LocalWakeWordProvider, type WakeWordProvider } from './wake-word';

const SILENCE_RMS = 0.018;
export const FOLLOWUP_IDLE_TIMEOUT_MS = 20_000;
export const isJarvisSessionEndPhrase = (value: string) => /^(?:stop|thanks? jarvis|go to sleep|sleep|cancel|end conversation|bas(?: jarvis)?|theek hai bas|so jao|abhi ke liye bas|band karo)$/i.test(value.trim().replace(/[’']/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' '));
export const sanitizeJarvisTranscript = (value: string) =>
  value
    .trim()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isMeaningfulJarvisTranscript = (value: string) =>
  sanitizeJarvisTranscript(value).length > 0;

export const isIncidentalJarvisTranscript = (value: string) => {
  const normalized = sanitizeJarvisTranscript(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return /^(?:oh|ah|uh|um|umm|hmm|hm|huh|yeah|yep|yup|okay|ok|right|wow|aha|mm|mmm)$/.test(
    normalized,
  );
};
const message = (error: unknown) => error instanceof Error ? error.message : 'Jarvis could not complete that request.';
const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length));

export function useJarvisVoice() {
  const [state, setState] = React.useState<JarvisVoiceState>('idle');
  const [transcript, setTranscript] = React.useState<string | null>(null);
  const [response, setResponse] = React.useState<JarvisOperationalResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const wakeStream = React.useRef<MediaStream | null>(null);
  const wake = React.useRef<WakeWordProvider | null>(null);
  const audio = React.useRef<HTMLAudioElement | null>(null);
  const playbackContext = React.useRef<AudioContext | null>(null);
  const playbackSource = React.useRef<AudioBufferSourceNode | null>(null);
  const playbackGeneration = React.useRef(0);
  const voiceEnabled = React.useRef(false);
  const conversationActive = React.useRef(false);
  const followupTimer = React.useRef<number | null>(null);
  const captureStop = React.useRef<(() => void) | null>(null);

  const releaseWake = React.useCallback(() => {
    if (followupTimer.current !== null) window.clearTimeout(followupTimer.current); followupTimer.current = null;
    captureStop.current?.(); captureStop.current = null;
    void wake.current?.dispose(); wake.current = null;
    wakeStream.current?.getTracks().forEach((track) => track.stop()); wakeStream.current = null;
  }, []);
  const cancel = React.useCallback(() => {
    voiceEnabled.current = false; conversationActive.current = false; playbackGeneration.current += 1; captureStop.current?.(); playbackSource.current?.stop(); playbackSource.current = null; void playbackContext.current?.close(); playbackContext.current = null; audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src); audio.current = null; releaseWake(); setState('idle');
  }, [releaseWake]);

  const askRef = React.useRef<(blob: Blob) => Promise<void>>(async () => undefined);
  const captureCommand = React.useCallback(async (followup = false) => {
    const stream = wakeStream.current;
    if (!voiceEnabled.current || !stream?.active || captureStop.current) return;
    await wake.current?.stop(); wake.current = null; setState(followup ? 'followup_listening' : 'listening');
    const context = new AudioContext(); const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1); const sink = context.createGain(); sink.gain.value = 0;
    const samples: number[] = []; const startedAt = performance.now(); let speechStartedAt: number | null = null; let lastSpeechAt: number | null = null; let voicedFrames = 0; let finished = false;
    const finish = () => {
      if (finished) return; finished = true; captureStop.current = null; processor.disconnect(); source.disconnect(); sink.disconnect(); void context.close();
      if (speechStartedAt === null) { if (followup) setState('followup_listening'); return; }
      const preRoll = Math.floor(context.sampleRate * 0.15); const start = Math.max(0, Math.floor((speechStartedAt / 1000) * context.sampleRate) - preRoll);
      const blob = encodePcm16Wav(new Float32Array(samples.slice(start)), context.sampleRate);
      if (blob.size > 44 && voiceEnabled.current) void askRef.current(blob);
    };
    captureStop.current = finish;
    if (followup) followupTimer.current = window.setTimeout(() => { if (speechStartedAt === null) { conversationActive.current = false; captureStop.current?.(); captureStop.current = null; followupTimer.current = null; setState('wake_listening'); } }, FOLLOWUP_IDLE_TIMEOUT_MS);
    processor.onaudioprocess = (event) => {
      const chunk = event.inputBuffer.getChannelData(0); samples.push(...chunk);
      const elapsed = performance.now() - startedAt; const loud = rms(chunk) >= SILENCE_RMS;
      if (loud) { voicedFrames += 1; if (voicedFrames >= 3) { speechStartedAt ??= elapsed; lastSpeechAt = elapsed; } } else { voicedFrames = 0; }
      if (speechStartedAt !== null && lastSpeechAt !== null && elapsed >= COMMAND_MIN_MS && elapsed - lastSpeechAt >= COMMAND_SILENCE_MS) finish();
      if (elapsed >= COMMAND_MAX_MS) finish();
    };
    source.connect(processor); processor.connect(sink); sink.connect(context.destination); await context.resume();
  }, []);
  const resumeWake = React.useCallback(async () => {
    if (!voiceEnabled.current || !wakeStream.current?.active) return;
    try { const provider = new LocalWakeWordProvider(); wake.current = provider; await provider.start({ stream: wakeStream.current, onWake: () => { if (conversationActive.current) return; conversationActive.current = true; void captureCommand(); } }); if (voiceEnabled.current) setState('wake_listening'); }
    catch (reason) { if (voiceEnabled.current) { setError(message(reason)); setState('error'); } }
  }, [captureCommand]);
  const ask = React.useCallback(async (blob: Blob) => {
    try {
      setState('transcribing'); const result = await transcribeJarvisAudio(blob);
      const transcript = sanitizeJarvisTranscript(result.text);
      if (!isMeaningfulJarvisTranscript(result.text)) { if (conversationActive.current) void captureCommand(true); else setState('wake_listening'); return; }
      if (isIncidentalJarvisTranscript(transcript)) { if (conversationActive.current) void captureCommand(true); else setState('wake_listening'); return; }
      if (isJarvisSessionEndPhrase(transcript)) { conversationActive.current = false; setState('wake_listening'); return; }
      setTranscript(transcript); setState('thinking'); const answer = await queryJarvis(transcript);
      setResponse(answer); setState('speaking'); const sound = await synthesizeJarvis(answer.spokenAnswerText ?? answer.answerText);
      const context = !playbackContext.current || playbackContext.current.state === 'closed' ? new AudioContext() : playbackContext.current; playbackContext.current = context;
      if (context.state === 'suspended') await context.resume(); const decoded = await context.decodeAudioData(await sound.arrayBuffer());
      const turn = ++playbackGeneration.current; playbackSource.current?.stop(); const source = context.createBufferSource(); source.buffer = decoded; source.connect(context.destination); playbackSource.current = source;
      source.onended = () => { if (playbackGeneration.current !== turn || playbackSource.current !== source) return; playbackSource.current = null; if (conversationActive.current) void captureCommand(true); else setState('wake_listening'); };
      source.start(); if (process.env.NODE_ENV === 'development') console.debug('[JARVIS AUDIO] playback started turn=' + turn);
    } catch (reason) { setError(message(reason)); setState('error'); }
  }, [captureCommand, resumeWake]);
  askRef.current = ask;
  const startConversation = React.useCallback(async () => {
    if (!voiceEnabled.current || conversationActive.current || captureStop.current) return;
    try {
      const context = playbackContext.current ?? new AudioContext(); playbackContext.current = context; await context.resume();
      conversationActive.current = true; wakeStream.current ??= await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); await captureCommand();
    }
    catch (reason) { conversationActive.current = false; setError(message(reason)); setState(voiceEnabled.current ? 'wake_listening' : 'idle'); }
  }, [captureCommand]);
  const enableWake = React.useCallback(async () => {
    if (voiceEnabled.current) return; setError(null); setResponse(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) { setError('Microphone capture is not supported by this browser.'); setState('error'); return; }
    voiceEnabled.current = true; setState('wake_listening');
  }, []);
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; if (!event.ctrlKey || event.code !== 'Space' || event.repeat || target?.matches('input,textarea,select,[contenteditable="true"]')) return; event.preventDefault(); void startConversation(); };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [startConversation]);
  React.useEffect(() => () => cancel(), [cancel]);
  return { state, transcript, response, error, conversationActive: conversationActive.current, enableWake, disableWake: cancel, cancel, clearError: () => { setError(null); setState('idle'); } };
}
