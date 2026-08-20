import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { MediaModule } from '../media/media.module';
import { VideoCompositionController } from './video-composition.controller';
import { VideoCompositionService } from './video-composition.service';
import { VideoRenderInputController } from './video-render-input.controller';
import { VideoRenderInputService } from './video-render-input.service';
@Module({imports:[StorageModule,MediaModule],controllers:[VideoCompositionController,VideoRenderInputController],providers:[VideoCompositionService,VideoRenderInputService]}) export class VideoCompositionModule {}
