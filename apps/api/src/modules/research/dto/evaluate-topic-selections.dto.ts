import { IsOptional, IsUUID } from "class-validator";
export class EvaluateTopicSelectionsDto { @IsOptional() @IsUUID() projectId?: string; @IsOptional() @IsUUID() opportunityId?: string; }
