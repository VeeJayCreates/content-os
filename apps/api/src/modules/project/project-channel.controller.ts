import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { ProjectChannelService } from './project-channel.service';

@Controller('projects')
export class ProjectChannelController {
  constructor(private readonly service: ProjectChannelService) {}

  @Get(':id/channel-hierarchy')
  getHierarchy(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getHierarchy(id);
  }
}
