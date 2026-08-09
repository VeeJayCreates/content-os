import { IsOptional, IsUUID } from 'class-validator';

export class ListResearchSourcesDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
