import { Module } from '@nestjs/common';
import { ContentModule } from './modules/content';
import { ProjectModule } from './modules/project';
import { ResearchModule } from './modules/research';
import { AiRuntimeModule } from './modules/ai/ai-runtime.module';
import { AudioModule } from './modules/audio/audio.module';
import { VideoCompositionModule } from './modules/production/video-composition.module';
import { MediaModule } from './modules/media/media.module';
import { AgentRuntimeModule } from './modules/agent-runtime/agent-runtime.module';
import { JarvisModule } from './modules/jarvis/jarvis.module';

@Module({
  imports: [AiRuntimeModule, AgentRuntimeModule, JarvisModule, AudioModule, ContentModule, ProjectModule, ResearchModule, VideoCompositionModule, MediaModule],
})
export class AppModule {}
