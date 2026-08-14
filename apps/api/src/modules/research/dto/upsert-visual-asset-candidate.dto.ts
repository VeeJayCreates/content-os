import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';

const mediaTypes = ['image', 'video'];
const candidateStatuses = ['discovered', 'shortlisted', 'unavailable', 'stale'];

export class UpsertVisualAssetCandidateDto {
  @IsString() @Length(1, 80) provider!: string;
  @IsOptional() @IsString() @Length(1, 256) providerAssetId?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @Length(1, 2048) sourceUrl?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @Length(1, 2048) previewUrl?: string;
  @IsOptional() @IsString() @Length(1, 512) mediaIdentity?: string;
  @IsIn(mediaTypes) mediaType!: string;
  @IsOptional() @IsString() @Length(1, 100) mimeType?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20_000) width?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20_000) height?: number;
  @IsOptional() @IsInt() @Min(1) @Max(86_400_000) durationMs?: number;
  @IsOptional() @IsString() @Length(1, 256) checksum?: string;
  @IsOptional() @IsString() @Length(1, 500) title?: string;
  @IsOptional() @IsString() @Length(1, 100) licenceType?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @Length(1, 2048) licenceUrl?: string;
  @IsOptional() @IsString() @Length(1, 1000) attributionText?: string;
  @IsOptional() @IsBoolean() commercialUseAllowed?: boolean;
  @IsOptional() @IsBoolean() modificationAllowed?: boolean;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(100) provenanceScore?: number;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(100) overallScore?: number;
  @IsOptional() @IsIn(candidateStatuses) status?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @Length(1, 160, { each: true }) rejectionReasons?: string[];
}
