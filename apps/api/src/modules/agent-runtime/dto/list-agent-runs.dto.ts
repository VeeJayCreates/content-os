import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AgentRunStatus } from '@content-os/contracts';

export class ListAgentRunsDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() agentKey?: string;
  @IsOptional() @IsEnum(AgentRunStatus) status?: AgentRunStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
