import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { HistoricalResearchStateReconciliationService } from './historical-research-state-reconciliation.service';

class HistoricalResearchReconciliationDto {
  @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) signalIds!: string[];
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

@Controller('projects')
export class HistoricalResearchStateReconciliationController {
  constructor(private readonly service: HistoricalResearchStateReconciliationService) {}
  @Get(':projectId/research/historical-reconciliation') audit(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Query('signalIds') signalIds?: string) {
    return this.service.audit(projectId, signalIds?.split(',').filter(Boolean));
  }
  @Post(':projectId/research/historical-reconciliation') repair(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() dto: HistoricalResearchReconciliationDto) {
    return this.service.repair(projectId, dto.signalIds, dto.dryRun === true);
  }
}
