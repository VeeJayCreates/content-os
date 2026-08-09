import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';

import { UpdateProjectEditorialProfileDto } from './dto/update-project-editorial-profile.dto';
import { ProjectEditorialProfileService } from './project-editorial-profile.service';

@Controller('projects')
export class ProjectEditorialProfileController {
  constructor(private readonly service: ProjectEditorialProfileService) {}

  @Get(':id/editorial-profile')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  @Patch(':id/editorial-profile')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectEditorialProfileDto,
  ) {
    return this.service.update(id, dto);
  }
}
