import { Body, Controller, Get, HttpCode, Inject, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JarvisQueryDto } from './dto/jarvis-query.dto';
import { JarvisService } from './jarvis.service';
import { JARVIS_STT_PROVIDER, JARVIS_TTS_PROVIDER } from './jarvis-provider.tokens';
import type { SpeechToTextProvider, VoiceSynthesisProvider } from './jarvis.types';

@Controller('jarvis')
export class JarvisController {
  constructor(private readonly service: JarvisService, @Inject(JARVIS_STT_PROVIDER) private readonly stt: SpeechToTextProvider, @Inject(JARVIS_TTS_PROVIDER) private readonly tts: VoiceSynthesisProvider) {}
  @Post('query') @HttpCode(200) query(@Body() dto: JarvisQueryDto) { return this.service.query(dto.text); }
  @Get('health') async health() {
    const probe = async (url: string | undefined) => {
      if (!url?.trim()) return 'unavailable';
      try { const response = await fetch(url, { signal: AbortSignal.timeout(2_000) }); return response.ok ? 'available' : 'unavailable'; } catch { return 'unavailable'; }
    };
    const wakeBase = process.env.OPENWAKEWORD_URL?.replace(/^ws/, 'http').replace(/\/wake\/?$/, '');
    return { wake: await probe(wakeBase ? `${wakeBase}/health` : undefined), stt: await probe(process.env.LOCAL_WHISPER_URL), tts: await probe(process.env.SUPERTONIC_URL ? `${process.env.SUPERTONIC_URL.replace(/\/$/, '')}/docs` : undefined) };
  }
  @Post('transcribe') @UseInterceptors(FileInterceptor('audio')) async transcribe(@UploadedFile() file?: { buffer: Buffer; mimetype?: string }) {
    if (!file?.buffer?.length) return { text: '', language: null, durationMs: null, provider: this.stt.id };
    return this.stt.transcribe({ audio: file.buffer, mimeType: file.mimetype || 'audio/webm' });
  }
  @Post('speak') async speak(@Body() dto: JarvisQueryDto, @Res() response: Response) {
    const result = await this.tts.synthesize({ text: dto.text });
    response.setHeader('content-type', result.mimeType);
    response.setHeader('cache-control', 'no-store');
    response.send(result.audio);
  }
}
