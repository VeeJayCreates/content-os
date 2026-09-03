import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Query,
} from '@nestjs/common';

import { ListResearchPackagesDto } from './dto/list-research-packages.dto';
import { ResearchPackageService } from './research-package.service';
import { ReviewResearchPackageDto } from './dto/review-research-package.dto';

@Controller()
export class ResearchPackageController {
  constructor(private readonly service: ResearchPackageService) {}

  @Post('opportunities/:id/research')
  generate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.generate(id);
  }

  @Get('research-packages')
  findAll(@Query() query: ListResearchPackagesDto) {
    return this.service.findAll(query.projectId);
  }

  @Get('research-packages/:id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch('research-packages/:id/review')
  review(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ReviewResearchPackageDto) {
    return this.service.review(id, dto.decision);
  }
}
