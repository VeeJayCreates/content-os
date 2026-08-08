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

import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { ListContentDto } from './dto/list-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  getAll(@Query() query: ListContentDto) {
    return this.contentService.findAll(query.projectId);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.contentService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateContentDto) {
    return this.contentService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.contentService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contentService.remove(id);
  }
}
