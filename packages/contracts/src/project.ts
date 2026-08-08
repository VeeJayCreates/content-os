import { ContentType, ProjectStatus } from "./enums";

export interface Project {
  id: string;
  name: string;
  contentType: ContentType;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}
