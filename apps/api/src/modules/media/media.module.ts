import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { MEDIA_MATERIALIZATION_OPTIONS, MEDIA_STORAGE_PROVIDER, MEDIA_STORAGE_ROOT } from './media-storage-provider';
import { LocalMediaStorageProvider } from './local-media-storage.provider';
import { MediaMaterializationService } from './media-materialization.service';

@Module({
  imports: [StorageModule],
  providers: [
    { provide: MEDIA_STORAGE_ROOT, useFactory: () => process.env.MEDIA_STORAGE_ROOT || 'D:\\ContentOS-Media' },
    LocalMediaStorageProvider,
    { provide: MEDIA_STORAGE_PROVIDER, useExisting: LocalMediaStorageProvider },
    { provide: MEDIA_MATERIALIZATION_OPTIONS, useValue: {} },
    MediaMaterializationService,
  ],
  exports: [MediaMaterializationService, MEDIA_STORAGE_PROVIDER],
})
export class MediaModule {}
