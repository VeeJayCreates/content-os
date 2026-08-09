import { Module } from '@nestjs/common';
import { ContentModule } from './modules/content';
import { ProjectModule } from './modules/project';
import { ResearchModule } from './modules/research';

@Module({
  imports: [ContentModule, ProjectModule, ResearchModule],
})
export class AppModule {}
