import { IsOptional, IsUUID } from 'class-validator';

export class DetectOpportunitiesDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
