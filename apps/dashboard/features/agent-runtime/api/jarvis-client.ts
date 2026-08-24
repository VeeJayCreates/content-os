import type { JarvisOperationalResponse, SpeechTranscription } from '@content-os/contracts';

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) { const body = await response.json().catch(() => null) as { message?: unknown } | null; throw new Error(typeof body?.message === 'string' ? body.message : 'Jarvis is unavailable.'); }
  return response.json() as Promise<T>;
}
export const transcribeJarvisAudio = (audio: Blob) => { const form = new FormData(); form.append('audio', audio, 'jarvis.webm'); return json<SpeechTranscription>('/api/jarvis/transcribe', { method: 'POST', body: form }); };
export const queryJarvis = (text: string) => json<JarvisOperationalResponse>('/api/jarvis/query', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
export const synthesizeJarvis = async (text: string) => { const response = await fetch('/api/jarvis/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); if (!response.ok) throw new Error('Local voice synthesis is unavailable.'); return response.blob(); };
