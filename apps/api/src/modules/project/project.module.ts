import { Module } from '@nestjs/common';

import { ProjectController } from './project.controller';
import { SelectionPolicyController } from './selection-policy.controller';
import { SelectionPolicyService } from './selection-policy.service';
import { ProjectService } from './project.service';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ProjectController, SelectionPolicyController],
  providers: [ProjectService, SelectionPolicyService],
})
export class ProjectModule {}
