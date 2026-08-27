import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { MediaModule } from '../media/media.module';
import { VideoCompositionController } from './video-composition.controller';
import { VideoCompositionService } from './video-composition.service';
import { VideoRenderInputController } from './video-render-input.controller';
import { VideoRenderInputService } from './video-render-input.service';
import { VideoRenderJobController } from './video-render-job.controller';
import { VideoRenderJobService } from './video-render-job.service';
import { VideoRenderWorkerService } from './video-render-worker.service';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { FfmpegVideoRenderer } from './ffmpeg-video.renderer';
import { VIDEO_RENDERER } from './video-renderer';
import { VideoMotionController } from './video-motion.controller';import { VideoMotionService } from './video-motion.service';
@Module({imports:[StorageModule,MediaModule,AgentRuntimeModule],controllers:[VideoCompositionController,VideoRenderInputController,VideoRenderJobController,VideoMotionController],providers:[VideoCompositionService,VideoMotionService,VideoRenderInputService,VideoRenderJobService,VideoRenderWorkerService,FfmpegVideoRenderer,{provide:VIDEO_RENDERER,useExisting:FfmpegVideoRenderer}],exports:[VideoRenderWorkerService]}) export class VideoCompositionModule {}
