export type ValidatedWav = { sampleRate: number; channels: number; durationMs: number };

const invalidWav = () => new Error('Audio provider produced invalid WAV output');

export function validateWav(buffer: Buffer): ValidatedWav {
  if (buffer.length < 44 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') throw invalidWav();
  let offset = 12;
  let sampleRate: number | null = null;
  let channels: number | null = null;
  let byteRate: number | null = null;
  let dataSize: number | null = null;
  while (offset + 8 <= buffer.length) {
    const name = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length) throw invalidWav();
    if (name === 'fmt ' && size >= 16) {
      const format = buffer.readUInt16LE(body);
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      byteRate = buffer.readUInt32LE(body + 8);
      if (format !== 1 && format !== 3) throw new Error('Audio provider produced unsupported WAV output');
    }
    if (name === 'data') dataSize = size;
    offset = body + size + (size % 2);
  }
  if (!sampleRate || !channels || !byteRate || dataSize === null || sampleRate > 192_000 || channels > 8) throw invalidWav();
  const durationMs = Math.round((dataSize / byteRate) * 1000);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 10 * 60 * 1000) throw new Error('Audio provider produced invalid WAV duration');
  return { sampleRate, channels, durationMs };
}
