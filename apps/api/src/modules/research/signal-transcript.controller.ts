import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SignalTranscriptService } from './signal-transcript.service';

@Controller('signals')
export class SignalTranscriptController {
  constructor(private readonly transcripts: SignalTranscriptService) {}
  @Get(':id/transcript') get(@Param('id', new ParseUUIDPipe()) id: string) { return this.transcripts.get(id); }
}
