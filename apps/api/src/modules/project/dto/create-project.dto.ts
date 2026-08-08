import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ContentType, ProjectStatus } from '@content-os/contracts';

export { ContentType, ProjectStatus } from '@content-os/contracts';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsEnum(ContentType)
  contentType!: ContentType;

  @IsEnum(ProjectStatus)
  @IsOptional()
  status: ProjectStatus = ProjectStatus.DRAFT;
}
