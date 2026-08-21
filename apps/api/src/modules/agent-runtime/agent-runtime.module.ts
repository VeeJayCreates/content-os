import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { AgentRuntimeController } from './agent-runtime.controller';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentPipelineBridgeController } from './agent-pipeline-bridge.controller';
import { AgentPipelineBridgeService } from './agent-pipeline-bridge.service';
import { AGENT_PIPELINE_BRIDGE } from './agent-pipeline-bridge.token';

@Module({ imports: [StorageModule], controllers: [AgentRuntimeController, AgentPipelineBridgeController], providers: [AgentRuntimeService, AgentPipelineBridgeService, { provide: AGENT_PIPELINE_BRIDGE, useExisting: AgentPipelineBridgeService }], exports: [AgentRuntimeService, AgentPipelineBridgeService, AGENT_PIPELINE_BRIDGE] })
export class AgentRuntimeModule {}
