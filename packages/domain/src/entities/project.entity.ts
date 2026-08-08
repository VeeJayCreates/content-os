import { ContentType } from '../enums/content-type.enum';
import { ProjectStatus } from '../enums/project-status.enum';

export class ProjectEntity {
  id!: string;

  name!: string;

  description?: string;

  contentType!: ContentType;

  status!: ProjectStatus;

  createdAt!: Date;

  updatedAt!: Date;
}