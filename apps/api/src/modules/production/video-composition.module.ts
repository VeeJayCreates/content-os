import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { MediaModule } from '../media/media.module';
import { VideoCompositionController } from './video-composition.controller';
import { VideoCompositionService } from './video-composition.service';
@Module({imports:[StorageModule,MediaModule],controllers:[VideoCompositionController],providers:[VideoCompositionService]}) export class VideoCompositionModule {}
