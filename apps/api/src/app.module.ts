import { Module } from '@nestjs/common';
import { ContentModule } from './modules/content';
import { ProjectModule } from './modules/project';
import { ResearchModule } from './modules/research';
import { AiRuntimeModule } from './modules/ai/ai-runtime.module';

@Module({
  imports: [AiRuntimeModule, ContentModule, ProjectModule, ResearchModule],
})
export class AppModule {}
