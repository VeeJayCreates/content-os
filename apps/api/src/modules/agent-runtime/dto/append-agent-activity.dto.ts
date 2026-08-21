import { IsEnum, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { AgentActivityType, AgentRunStatus } from '@content-os/contracts';

export class AppendAgentActivityDto {
  @IsEnum(AgentActivityType) type!: AgentActivityType;
  @IsString() @Length(1, 500) message!: string;
  @IsOptional() @IsObject() state?: Record<string, unknown>;
  @IsOptional() @IsEnum(AgentRunStatus) status?: AgentRunStatus;
}
