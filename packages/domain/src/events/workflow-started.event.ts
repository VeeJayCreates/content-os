export class WorkflowStartedEvent {
  constructor(
    public readonly workflowId: string,
    public readonly startedAt: Date = new Date(),
  ) {}
}