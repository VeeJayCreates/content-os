import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ResearchAutomationService } from './research-automation.service';

@Controller('projects/:projectId/research-automation')
export class ResearchAutomationController {
  constructor(private readonly automation: ResearchAutomationService) {}

  @Get('status') status(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.automation.status(projectId); }
  @Post('run') run(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.automation.runProject(projectId); }
  @Get('review-queue') reviewQueue(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.automation.reviewQueue(projectId); }
}
