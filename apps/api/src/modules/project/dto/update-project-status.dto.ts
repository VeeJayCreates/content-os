import { IsEnum } from 'class-validator';
import { ProjectStatus } from '@content-os/contracts';

export class UpdateProjectStatusDto {
  @IsEnum(ProjectStatus)
  status!: ProjectStatus;
}