import { ContentType, ProjectStatus } from "./enums";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  contentType: ContentType;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  contentType: ContentType;
  status?: ProjectStatus;
}
