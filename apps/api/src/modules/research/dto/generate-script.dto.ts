import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ScriptFormat, ScriptLanguage } from '@content-os/contracts';

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
}
