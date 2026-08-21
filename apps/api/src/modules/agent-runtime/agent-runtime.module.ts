import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { AgentRuntimeController } from './agent-runtime.controller';
import { AgentRuntimeService } from './agent-runtime.service';

@Module({ imports: [StorageModule], controllers: [AgentRuntimeController], providers: [AgentRuntimeService], exports: [AgentRuntimeService] })
export class AgentRuntimeModule {}
