import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AgentPipelineBridgeService } from './agent-pipeline-bridge.service';

@Controller('agent-pipelines')
export class AgentPipelineBridgeController {
  constructor(private readonly bridge: AgentPipelineBridgeService) {}
  @Post('production-queue/:id/synchronize') synchronize(@Param('id', new ParseUUIDPipe()) id: string) { return this.bridge.synchronize(id); }
}
