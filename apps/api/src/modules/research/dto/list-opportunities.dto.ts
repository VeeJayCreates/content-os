import { IsOptional, IsUUID } from 'class-validator';

export class ListOpportunitiesDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
