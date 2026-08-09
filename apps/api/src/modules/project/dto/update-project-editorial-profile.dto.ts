import { Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EditorialTimelinessPreference } from '@content-os/contracts';

const PROFILE_TEXT_MAX_LENGTH = 1_000;
const PROFILE_SHORT_TEXT_MAX_LENGTH = 120;
const PROFILE_ARRAY_MAX_SIZE = 20;
const PROFILE_ARRAY_ITEM_MAX_LENGTH = 120;

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimStringArray({ value }: TransformFnParams): unknown {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;
}

export class UpdateProjectEditorialProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(PROFILE_TEXT_MAX_LENGTH)
  @Transform(trimText)
  mission?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(PROFILE_TEXT_MAX_LENGTH)
  @Transform(trimText)
  targetAudience?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  @Transform(trimText)
  primaryLanguage?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  @Transform(trimText)
  primaryGeography?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_SIZE)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  @Transform(trimStringArray)
  topicThemes?: string[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_SIZE)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  @Transform(trimStringArray)
  excludedTopics?: string[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_SIZE)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  @Transform(trimStringArray)
  contentGoals?: string[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_SIZE)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  @Transform(trimStringArray)
  preferredFormats?: string[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(EditorialTimelinessPreference)
  timelinessPreference?: EditorialTimelinessPreference;
}
