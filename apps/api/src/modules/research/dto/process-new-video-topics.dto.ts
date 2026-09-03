import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** Explicitly scoped incremental topic work. Historical signals are never inferred. */
export class ProcessNewVideoTopicsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  signalIds!: string[];
}
