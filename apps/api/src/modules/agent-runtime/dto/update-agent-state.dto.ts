import { IsObject } from 'class-validator';

export class UpdateAgentStateDto {
  @IsObject() state!: Record<string, unknown>;
}
