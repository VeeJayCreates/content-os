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
import { ResearchSourceRole, ResearchSourceType } from '@content-os/contracts';

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

  @IsEnum(ResearchSourceRole)
  @IsOptional()
  role?: ResearchSourceRole;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  @IsOptional()
  url?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
