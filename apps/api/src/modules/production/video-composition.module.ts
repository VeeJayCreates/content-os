import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { VideoCompositionController } from './video-composition.controller';
import { VideoCompositionService } from './video-composition.service';
@Module({imports:[StorageModule],controllers:[VideoCompositionController],providers:[VideoCompositionService]}) export class VideoCompositionModule {}
