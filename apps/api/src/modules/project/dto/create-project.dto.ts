import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum ContentType {
  GEOPOLITICS = 'geopolitics',
  ASTROLOGY = 'astrology',
}

export enum ProjectStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

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