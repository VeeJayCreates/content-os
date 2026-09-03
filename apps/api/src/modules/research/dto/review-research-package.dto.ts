import { IsIn } from 'class-validator';

export class ReviewResearchPackageDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';
}
