import assert from 'node:assert/strict';
import test from 'node:test';
import { float32ToPcm16, isJarvisWakePhrase, resampleMonoTo16k } from './wake-word';
import { encodePcm16Wav } from './command-audio';

test('accepts only the explicit Hey Jarvis phrase', () => {
  assert.equal(isJarvisWakePhrase('Hey Jarvis'), true);
  assert.equal(isJarvisWakePhrase('hello Jarvis'), false);
  assert.equal(isJarvisWakePhrase('good morning'), false);
});
test('resamples common microphone rates deterministically to 16 kHz mono', () => {
  assert.equal(resampleMonoTo16k(new Float32Array(4_800), 48_000).length, 1_600);
  assert.equal(resampleMonoTo16k(new Float32Array(4_410), 44_100).length, 1_600);
});
test('converts clamped float samples to signed PCM16', () => {
  assert.deepEqual([...float32ToPcm16(new Float32Array([-2, -1, 0, 1, 2]))], [-32768, -32768, 0, 32767, 32767]);
});
test('encodes a mono PCM16 WAV command payload', async () => {
  const bytes = new Uint8Array(await encodePcm16Wav(new Float32Array(160), 16_000).arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), 'WAVE');
  assert.equal(bytes.length, 44 + 320);
});
