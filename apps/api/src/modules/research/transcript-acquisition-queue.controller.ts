import { Body, Controller, Param, ParseUUIDPipe, Post, Get } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { TranscriptAcquisitionQueueService } from './transcript-acquisition-queue.service';

class SignalIdDto { @IsUUID('4') signalId!: string; }

@Controller('projects')
export class TranscriptAcquisitionQueueController {
  constructor(private readonly queue: TranscriptAcquisitionQueueService) {}
  @Get(':projectId/research/transcript-queue') inspect(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.queue.inspect(projectId); }
  @Post(':projectId/research/transcript-queue/reconcile') reconcile(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.queue.reconcile(projectId); }
  @Post(':projectId/research/transcript-queue/process-next') processNext(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.queue.processNext(projectId); }
  @Post(':projectId/research/transcript-queue/jobs/:jobId/process') processJob(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('jobId', new ParseUUIDPipe()) jobId: string) { return this.queue.processJob(projectId, jobId); }
  @Post(':projectId/research/transcript-queue/retry') retry(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() dto: SignalIdDto) { return this.queue.retry(projectId, dto.signalId); }
}
