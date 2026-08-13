import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { AudioRuntimeService } from './audio-runtime.service';
import { AUDIO_PROVIDER } from './audio-provider.token';
import { AudioGenerationController } from './audio-generation.controller';
import { SarvamBulbulConfiguration } from './sarvam-bulbul.configuration';
import { SarvamBulbulAudioProvider } from './sarvam-bulbul.provider';
import { selectAudioProvider } from './audio-provider-selector';
import { AudioRuntimeConfiguration } from './audio-runtime.configuration';

@Module({ imports: [StorageModule], controllers: [AudioGenerationController], providers: [AudioRuntimeService, AudioRuntimeConfiguration, SarvamBulbulConfiguration, SarvamBulbulAudioProvider, { provide: AUDIO_PROVIDER, useFactory: (sarvam: SarvamBulbulAudioProvider) => selectAudioProvider(process.env.AUDIO_DEFAULT_PROVIDER, sarvam), inject: [SarvamBulbulAudioProvider] }], exports: [AudioRuntimeService, SarvamBulbulConfiguration] })
export class AudioModule {}
