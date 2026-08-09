import { IsEnum } from 'class-validator';
import { OpportunityStatus } from '@content-os/contracts';

export class UpdateOpportunityStatusDto {
  @IsEnum(OpportunityStatus)
  status!: OpportunityStatus;
}
