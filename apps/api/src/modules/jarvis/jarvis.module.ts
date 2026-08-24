import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { JarvisController } from './jarvis.controller';
import { JarvisService } from './jarvis.service';
import { JARVIS_STT_PROVIDER, JARVIS_TTS_PROVIDER } from './jarvis-provider.tokens';
import { LocalWhisperProvider } from './local-whisper.provider';
import { SupertonicVoiceProvider } from './supertonic-voice.provider';

@Module({ imports: [AgentRuntimeModule], controllers: [JarvisController], providers: [JarvisService, LocalWhisperProvider, SupertonicVoiceProvider, { provide: JARVIS_STT_PROVIDER, useFactory: (provider: LocalWhisperProvider) => { if ((process.env.JARVIS_STT_PROVIDER ?? 'whisper-cpp').trim() !== 'whisper-cpp') throw new Error('JARVIS_STT_PROVIDER must select whisper-cpp'); return provider; }, inject: [LocalWhisperProvider] }, { provide: JARVIS_TTS_PROVIDER, useFactory: (provider: SupertonicVoiceProvider) => { if ((process.env.JARVIS_TTS_PROVIDER ?? 'supertonic').trim() !== 'supertonic') throw new Error('JARVIS_TTS_PROVIDER must select supertonic'); return provider; }, inject: [SupertonicVoiceProvider] }], exports: [JarvisService] })
export class JarvisModule {}
