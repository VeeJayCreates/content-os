import { Module } from '@nestjs/common';

import { StorageModule } from '../../storage/storage.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [StorageModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
