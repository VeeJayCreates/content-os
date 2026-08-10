import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResearchSourceRole, ResearchSourceType } from '@content-os/contracts';

export const MAX_BULK_RESEARCH_SOURCES = 100;

export class BulkResearchSourceDto {
  @IsString()
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class BulkCreateResearchSourcesDto {
  @IsUUID()
  projectId!: string;

  @IsEnum(ResearchSourceType)
  sourceType!: ResearchSourceType;

  @IsEnum(ResearchSourceRole)
  defaultRole!: ResearchSourceRole;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_RESEARCH_SOURCES)
  @ValidateNested({ each: true })
  @Type(() => BulkResearchSourceDto)
  sources!: BulkResearchSourceDto[];
}
