import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ContentStyleIntensity, ContentStylePreset, ContentTone, HookStyle, NarrationStyle, ScriptLanguage } from '@content-os/contracts';

export class ContentStyleOverrideDto {
  @IsOptional() @IsEnum(ContentStylePreset) preset?: ContentStylePreset;
  @IsOptional() @IsEnum(ScriptLanguage) primaryLanguage?: ScriptLanguage;
  @IsOptional() @IsEnum(ScriptLanguage) secondaryLanguage?: ScriptLanguage | null;
  @IsOptional() @IsEnum(ContentTone) tone?: ContentTone;
  @IsOptional() @IsEnum(NarrationStyle) narrationStyle?: NarrationStyle;
  @IsOptional() @IsEnum(HookStyle) hookStyle?: HookStyle;
  @IsOptional() @IsEnum(ContentStyleIntensity) desiWordingLevel?: ContentStyleIntensity;
  @IsOptional() @IsEnum(ContentStyleIntensity) sarcasmLevel?: ContentStyleIntensity;
  @IsOptional() @IsEnum(ContentStyleIntensity) humorLevel?: ContentStyleIntensity;
  @IsOptional() @IsEnum(ContentStyleIntensity) energyLevel?: ContentStyleIntensity;
  @IsOptional() @IsEnum(ContentStyleIntensity) sensationalismLevel?: ContentStyleIntensity;
  @IsOptional() @IsString() audienceDescription?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) preferredVocabulary?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) avoidedVocabulary?: string[];
  @IsOptional() @IsString() customInstructions?: string;
  @IsOptional() @IsBoolean() sensitiveTopicSarcasmEnabled?: boolean;
}
