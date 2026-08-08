export class ProjectCreatedEvent {
  constructor(
    public readonly projectId: string,
    public readonly createdAt: Date = new Date(),
  ) {}
}