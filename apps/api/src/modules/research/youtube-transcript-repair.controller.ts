import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RepairYouTubeTranscriptsDto } from './dto/repair-youtube-transcripts.dto';
import { YouTubeTranscriptRepairService } from './youtube-transcript-repair.service';
@Controller('projects') export class YouTubeTranscriptRepairController { constructor(private readonly service: YouTubeTranscriptRepairService) {} @Post(':projectId/research/transcripts/repair') repair(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() dto: RepairYouTubeTranscriptsDto) { return this.service.repair(projectId, dto.signalIds); } }
