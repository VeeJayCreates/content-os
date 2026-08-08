import { JobStatus } from '../enums/job-status.enum';

export class JobEntity {
  id!: string;

  workflowId!: string;

  type!: string;

  status!: JobStatus;

  payload!: unknown;

  result?: unknown;

  createdAt!: Date;

  completedAt?: Date;
}