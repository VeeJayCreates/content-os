export interface Workflow {
  id: string;
  projectId: string;
  currentJobId?: string;
  createdAt: Date;
  updatedAt: Date;
}
