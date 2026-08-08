import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ContentStatus, ContentType } from '@content-os/contracts';

export class CreateContentDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsEnum(ContentType)
  contentType!: ContentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body!: string;

  @IsEnum(ContentStatus)
  @IsOptional()
  status: ContentStatus = ContentStatus.DRAFT;
}
