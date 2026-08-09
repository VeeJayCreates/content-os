import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ResearchSourceType } from '@content-os/contracts';

export class UpdateResearchSourceDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsEnum(ResearchSourceType)
  @IsOptional()
  sourceType?: ResearchSourceType;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  @IsOptional()
  url?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
