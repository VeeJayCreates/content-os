import { IsOptional, IsUUID } from "class-validator";
export class ListTopicSelectionsDto { @IsOptional() @IsUUID() projectId?: string; }
