import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
export class RepairYouTubeTranscriptsDto { @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @IsUUID('4', { each: true }) signalIds!: string[]; }
