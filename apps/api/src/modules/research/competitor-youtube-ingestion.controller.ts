import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { CompetitorYouTubeIngestionService } from './competitor-youtube-ingestion.service';

@Controller('projects')
export class CompetitorYouTubeIngestionController {
  constructor(private readonly service: CompetitorYouTubeIngestionService) {}

  @Post(':projectId/research/competitor-youtube/ingest')
  ingest(@Param('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.service.ingest(projectId);
  }
}
