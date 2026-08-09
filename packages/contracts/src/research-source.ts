import type { Project } from "./project.js";
import { ResearchSourceType } from "./enums.js";

export type ResearchSourceProject = Pick<Project, "id" | "name">;

export interface ResearchSource {
  id: string;
  projectId: string;
  project: ResearchSourceProject;
  name: string;
  sourceType: ResearchSourceType;
  url: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchSourceInput {
  projectId: string;
  name: string;
  sourceType: ResearchSourceType;
  url: string;
  enabled?: boolean;
}

export interface UpdateResearchSourceInput {
  projectId?: string;
  name?: string;
  sourceType?: ResearchSourceType;
  url?: string;
  enabled?: boolean;
}
