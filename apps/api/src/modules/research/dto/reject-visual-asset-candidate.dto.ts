import { IsString, Length } from 'class-validator';

export class RejectVisualAssetCandidateDto {
  @IsString() @Length(1, 200) reason!: string;
}
