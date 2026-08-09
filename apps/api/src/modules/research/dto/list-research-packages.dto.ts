import { IsOptional, IsUUID } from 'class-validator';

export class ListResearchPackagesDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
