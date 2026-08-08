import type { Project } from "./project.js";
import { ContentStatus, ContentType } from "./enums.js";

export type ContentProject = Pick<Project, "id" | "name">;

export interface Content {
  id: string;
  projectId: string;
  project: ContentProject;
  title: string;
  contentType: ContentType;
  status: ContentStatus;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContentInput {
  projectId: string;
  title: string;
  contentType: ContentType;
  body: string;
  status?: ContentStatus;
}

export interface UpdateContentInput {
  projectId?: string;
  title?: string;
  contentType?: ContentType;
  body?: string;
  status?: ContentStatus;
}
