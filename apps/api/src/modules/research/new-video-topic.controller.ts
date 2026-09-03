import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { ProcessNewVideoTopicsDto } from './dto/process-new-video-topics.dto';
import { NewVideoTopicService } from './new-video-topic.service';

@Controller('projects')
export class NewVideoTopicController {
  constructor(private readonly service: NewVideoTopicService) {}

  @Post(':projectId/research/topics/process-new')
  processNew(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: ProcessNewVideoTopicsDto,
  ) {
    return this.service.process(projectId, dto.signalIds);
  }
}
