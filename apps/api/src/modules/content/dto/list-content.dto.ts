import { IsOptional, IsUUID } from 'class-validator';

export class ListContentDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
