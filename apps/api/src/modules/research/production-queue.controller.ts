import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { FillProductionQueueDto } from './dto/fill-production-queue.dto';
import { ProductionQueueService } from './production-queue.service';
@Controller('projects/:projectId/production-queue') export class ProductionQueueController { constructor(private readonly queue: ProductionQueueService) {} @Post('fill') fill(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() dto: FillProductionQueueDto) { return this.queue.fill(projectId, dto.targetCount); } @Get() findAll(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.queue.findAll(projectId); } }
