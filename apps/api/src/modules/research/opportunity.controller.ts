import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { DetectOpportunitiesDto } from './dto/detect-opportunities.dto';
import { ListOpportunitiesDto } from './dto/list-opportunities.dto';
import { UpdateOpportunityStatusDto } from './dto/update-opportunity-status.dto';
import { OpportunityService } from './opportunity.service';

@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly service: OpportunityService) {}
  @Post('detect') detect(@Body() dto: DetectOpportunitiesDto) { return this.service.detect(dto.projectId); }
  @Get() findAll(@Query() query: ListOpportunitiesDto) { return this.service.findAll(query.projectId); }
  @Get(':id') findOne(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.findOne(id); }
  @Patch(':id/status') updateStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateOpportunityStatusDto) { return this.service.updateStatus(id, dto.status); }
}
