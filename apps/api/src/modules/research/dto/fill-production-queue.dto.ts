import { IsInt, Max, Min } from 'class-validator';
export class FillProductionQueueDto { @IsInt() @Min(1) @Max(50) targetCount!: number; }
