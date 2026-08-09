import { IsOptional, IsUUID } from 'class-validator';

export class ListSignalsDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsUUID()
  @IsOptional()
  researchSourceId?: string;
}
