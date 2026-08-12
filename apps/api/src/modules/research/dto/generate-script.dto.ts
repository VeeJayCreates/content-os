import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { ScriptFormat, ScriptLanguage } from '@content-os/contracts';
import { ContentStyleOverrideDto } from './content-style-override.dto';

export class GenerateScriptDto {
  @IsOptional()
  @IsEnum(ScriptFormat)
  format?: ScriptFormat;

  @IsOptional()
  @IsEnum(ScriptLanguage)
  language?: ScriptLanguage;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  targetDurationSeconds?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentStyleOverrideDto)
  style?: ContentStyleOverrideDto;
}
