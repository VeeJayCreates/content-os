import { float32ToPcm16, resampleMonoTo16k } from './wake-word';

export const COMMAND_SAMPLE_RATE = 16_000;
export const COMMAND_MIN_MS = 500;
export const COMMAND_SILENCE_MS = 850;
export const COMMAND_MAX_MS = 10_000;

export function encodePcm16Wav(samples: Float32Array, inputSampleRate: number): Blob {
  const pcm = float32ToPcm16(resampleMonoTo16k(samples, inputSampleRate));
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + pcm.byteLength, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, COMMAND_SAMPLE_RATE, true); view.setUint32(28, COMMAND_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, pcm.byteLength, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: 'audio/wav' });
}
