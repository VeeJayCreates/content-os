import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CreateResearchSourceDto } from './dto/create-research-source.dto';
import { ListResearchSourcesDto } from './dto/list-research-sources.dto';
import { UpdateResearchSourceDto } from './dto/update-research-source.dto';
import { ResearchService } from './research.service';

@Controller('research-sources')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get()
  getAll(@Query() query: ListResearchSourcesDto) {
    return this.researchService.findAll(query.projectId);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.researchService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateResearchSourceDto) {
    return this.researchService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateResearchSourceDto) {
    return this.researchService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.researchService.remove(id);
  }
}
