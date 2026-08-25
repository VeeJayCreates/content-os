import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectService } from './project.service';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  getAll() {
    return this.projectService.findAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.projectService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.projectService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectService.remove(id);
  }
}