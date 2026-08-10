import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CreateResearchSourceDto } from './dto/create-research-source.dto';
import { BulkCreateResearchSourcesDto } from './dto/bulk-create-research-sources.dto';
import { ListResearchSourcesDto } from './dto/list-research-sources.dto';
import { UpdateResearchSourceDto } from './dto/update-research-source.dto';
import { IngestionService } from './ingestion.service';
import { ResearchService } from './research.service';

@Controller('research-sources')
export class ResearchController {
  constructor(
    private readonly researchService: ResearchService,
    private readonly ingestionService: IngestionService,
  ) {}

  @Get()
  getAll(@Query() query: ListResearchSourcesDto) {
    return this.researchService.findAll(query.projectId);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.researchService.findOne(id);
  }

  @Post(':id/ingest')
  ingest(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ingestionService.ingest(id);
  }

  @Post('bulk')
  bulkCreate(@Body() dto: BulkCreateResearchSourcesDto) {
    return this.researchService.bulkCreate(dto);
  }

  @Post()
  create(@Body() dto: CreateResearchSourceDto) {
    return this.researchService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateResearchSourceDto,
  ) {
    return this.researchService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.researchService.remove(id);
  }
}
