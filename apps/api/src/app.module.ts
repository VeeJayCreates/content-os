import { Module } from '@nestjs/common';
import { ProjectModule } from './modules/project';

@Module({
  imports: [ProjectModule],
})
export class AppModule {}
