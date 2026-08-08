import { Module } from '@nestjs/common';
import { ContentModule } from './modules/content';
import { ProjectModule } from './modules/project';

@Module({
  imports: [ContentModule, ProjectModule],
})
export class AppModule {}
