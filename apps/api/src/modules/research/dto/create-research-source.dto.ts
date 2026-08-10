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

export class CreateResearchSourceDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(ResearchSourceType)
  sourceType!: ResearchSourceType;

  @IsEnum(ResearchSourceRole)
  @IsOptional()
  role = ResearchSourceRole.BOTH;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @IsBoolean()
  @IsOptional()
  enabled = true;
}
