const TARGET_SAMPLE_RATE = 16_000;
const DEFAULT_WAKE_URL = 'ws://127.0.0.1:8765/wake';

export const isJarvisWakePhrase = (value: string) => /\bhey\s+jarvis\b/i.test(value.trim());

/** Deterministic linear resampling is sufficient for 16 kHz wake-word inference. */
export function resampleMonoTo16k(samples: Float32Array, inputSampleRate: number): Float32Array {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) throw new Error('Invalid microphone sample rate.');
  if (inputSampleRate === TARGET_SAMPLE_RATE) return new Float32Array(samples);
  const outputLength = Math.max(1, Math.round(samples.length * TARGET_SAMPLE_RATE / inputSampleRate));
  const output = new Float32Array(outputLength);
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, samples.length - 1);
    const mix = position - lower;
    output[index] = (samples[lower] ?? 0) * (1 - mix) + (samples[upper] ?? 0) * mix;
  }
  return output;
}

export function float32ToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = value < 0 ? Math.round(value * 32_768) : Math.round(value * 32_767);
  }
  return pcm;
}

export interface WakeWordProvider {
  readonly id: string;
  start(input: { stream: MediaStream; onWake: () => void }): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

type WakeMessage = { type?: unknown; wakeWord?: unknown; score?: unknown };
const isWakeMessage = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return false;
  const message = raw as WakeMessage;
  return message.type === 'wake' && message.wakeWord === 'hey_jarvis' && (typeof message.score !== 'number' || message.score >= 0);
};

/** Local-only browser bridge. Frames never leave localhost and are never persisted. */
export class LocalWakeWordProvider implements WakeWordProvider {
  readonly id = 'openwakeword';
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private stopped = false;
  private lastWakeAt = 0;
  private generation = 0;
  private reconnectTimer: number | null = null;

  constructor(private readonly url = process.env.NEXT_PUBLIC_OPENWAKEWORD_URL?.trim() || DEFAULT_WAKE_URL) {}

  async start({ stream, onWake }: { stream: MediaStream; onWake: () => void }): Promise<void> {
    await this.stop(); this.stopped = false;
    const generation = ++this.generation;
    const socket = await this.connect();
    if (this.stopped || generation !== this.generation) { socket.close(); return; }
    this.socket = socket;
    this.debug('connected');
    socket.onmessage = (event) => {
      let message: unknown;
      try { message = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch { return; }
      if (!isWakeMessage(message) || this.stopped || Date.now() - this.lastWakeAt < 2_500) return;
      this.lastWakeAt = Date.now(); onWake();
    };
    socket.onclose = (event) => {
      this.debug('closed', { code: event.code, reason: event.reason || undefined });
      if (!this.stopped && generation === this.generation && socket === this.socket) void this.reconnect(stream, onWake, generation);
    };
    this.context = new AudioContext(); await this.context.resume();
    this.source = this.context.createMediaStreamSource(stream);
    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.sink = this.context.createGain(); this.sink.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      if (this.stopped || socket.readyState !== WebSocket.OPEN) return;
      const frame = event.inputBuffer.getChannelData(0);
      const pcm = float32ToPcm16(resampleMonoTo16k(frame, this.context?.sampleRate ?? TARGET_SAMPLE_RATE));
      socket.send(pcm.buffer);
    };
    this.source.connect(this.processor); this.processor.connect(this.sink); this.sink.connect(this.context.destination);
  }
  async stop(): Promise<void> {
    this.stopped = true; this.generation += 1;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
    this.processor?.disconnect(); this.source?.disconnect(); this.sink?.disconnect();
    this.processor = null; this.source = null; this.sink = null;
    const socket = this.socket; this.socket = null; socket?.close();
    if (this.context) await this.context.close().catch(() => undefined); this.context = null;
  }
  async dispose(): Promise<void> { await this.stop(); }
  private connect(): Promise<WebSocket> { return new Promise((resolve, reject) => {
    const socket = new WebSocket(this.url);
    const timeout = window.setTimeout(() => { socket.close(); reject(new Error('Wake-word service is offline.')); }, 5_000);
    socket.onopen = () => { window.clearTimeout(timeout); resolve(socket); };
    socket.onerror = () => { window.clearTimeout(timeout); reject(new Error('Wake-word service is offline.')); };
  }); }
  private async reconnect(stream: MediaStream, onWake: () => void, generation: number): Promise<void> {
    if (this.reconnectTimer !== null) return;
    this.debug('reconnect_scheduled');
    await new Promise<void>((resolve) => { this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = null; resolve(); }, 1_000); });
    if (!this.stopped && generation === this.generation && stream.active) await this.start({ stream, onWake }).catch(() => undefined);
  }
  private debug(event: string, detail?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') console.debug('[Jarvis wake]', event, detail ?? '');
  }
}
