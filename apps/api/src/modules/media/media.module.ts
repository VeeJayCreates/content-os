import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { MEDIA_STORAGE_PROVIDER } from './media-storage-provider';
import { LocalMediaStorageProvider } from './local-media-storage.provider';
import { MediaMaterializationService } from './media-materialization.service';

@Module({ imports: [StorageModule], providers: [LocalMediaStorageProvider, { provide: MEDIA_STORAGE_PROVIDER, useExisting: LocalMediaStorageProvider }, MediaMaterializationService], exports: [MediaMaterializationService, MEDIA_STORAGE_PROVIDER] })
export class MediaModule {}
