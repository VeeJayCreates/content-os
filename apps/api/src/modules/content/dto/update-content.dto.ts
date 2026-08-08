import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ContentStatus, ContentType } from '@content-os/contracts';

export class UpdateContentDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @IsOptional()
  title?: string;

  @IsEnum(ContentType)
  @IsOptional()
  contentType?: ContentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  @IsOptional()
  body?: string;

  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;
}
