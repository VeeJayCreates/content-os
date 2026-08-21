import { IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateAgentRunDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9_-]*$/) @Length(1, 80) agentKey!: string;
  @IsOptional() @IsString() @Length(1, 100) projectId?: string;
  @IsOptional() @IsString() @Length(1, 80) subjectType?: string;
  @IsOptional() @IsString() @Length(1, 100) subjectId?: string;
  @IsOptional() @IsObject() state?: Record<string, unknown>;
}
