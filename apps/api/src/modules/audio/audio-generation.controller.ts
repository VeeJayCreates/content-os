import { Controller, Get, Header, Param, ParseUUIDPipe, Post, StreamableFile } from '@nestjs/common';
import { AudioRuntimeService } from './audio-runtime.service';

@Controller('content-scripts')
export class AudioGenerationController {
  constructor(private readonly audio: AudioRuntimeService) {}

  @Post(':id/audio-generation') async generate(@Param('id', new ParseUUIDPipe()) contentScriptId: string) {
    return this.toClientGeneration(await this.audio.generate(contentScriptId));
  }

  @Get(':id/audio-generation') async find(@Param('id', new ParseUUIDPipe()) contentScriptId: string) {
    return this.toClientGeneration(await this.audio.findForContentScript(contentScriptId));
  }

  @Get(':id/audio-generation/audio')
  @Header('Cache-Control', 'private, no-store')
  async stream(@Param('id', new ParseUUIDPipe()) contentScriptId: string) {
    return new StreamableFile(await this.audio.streamReadyAudio(contentScriptId), { type: 'audio/wav', disposition: 'inline; filename="content-os-audio.wav"' });
  }

  @Get(':id/audio-generation/segments/:segmentId/audio')
  @Header('Cache-Control', 'private, no-store')
  async streamSegment(@Param('id', new ParseUUIDPipe()) contentScriptId: string, @Param('segmentId') segmentId: string) {
    return new StreamableFile(await this.audio.streamReadyAudioSegment(contentScriptId, segmentId), { type: 'audio/wav', disposition: 'inline; filename="content-os-audio-segment.wav"' });
  }

  private toClientGeneration<T extends {
    outputPath: string | null;
    outputMetadata: unknown;
    segments: Array<{ audioPath: string | null }>;
  }>(generation: T) {
    return {
      ...generation,
      outputPath: null,
      outputMetadata: null,
      segments: generation.segments.map((segment) => ({
        ...segment,
        audioPath: null,
      })),
    };
  }
}
