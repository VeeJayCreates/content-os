import { JobStatus } from "./enums.js";

export interface Job {
  id: string;
  workflowId: string;
  type: string;
  status: JobStatus;
  startedAt?: Date;
  finishedAt?: Date;
  cost?: number;
  retries: number;
}
