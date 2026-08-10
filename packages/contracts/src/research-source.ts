import type { Project } from "./project.js";
import { ResearchSourceRole, ResearchSourceType } from "./enums.js";

export type ResearchSourceProject = Pick<Project, "id" | "name">;

export interface ResearchSource {
  id: string;
  projectId: string;
  project: ResearchSourceProject;
  name: string;
  sourceType: ResearchSourceType;
  role: ResearchSourceRole;
  url: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchSourceInput {
  projectId: string;
  name: string;
  sourceType: ResearchSourceType;
  role?: ResearchSourceRole;
  url: string;
  enabled?: boolean;
}

export interface UpdateResearchSourceInput {
  projectId?: string;
  name?: string;
  sourceType?: ResearchSourceType;
  role?: ResearchSourceRole;
  url?: string;
  enabled?: boolean;
}

export interface BulkResearchSourceInput {
  url: string;
  role?: ResearchSourceRole;
}

export interface BulkCreateResearchSourcesInput {
  projectId: string;
  sourceType: ResearchSourceType;
  defaultRole: ResearchSourceRole;
  sources: BulkResearchSourceInput[];
}

export type BulkResearchSourceStatus = "added" | "existing" | "failed";

export interface BulkResearchSourceResult {
  inputUrl: string;
  status: BulkResearchSourceStatus;
  source?: ResearchSource;
  errorCode?: "invalid_url" | "invalid_role" | "duplicate_in_batch" | "unresolved_youtube_channel" | "create_failed";
  message?: string;
}

export interface BulkCreateResearchSourcesResult {
  total: number;
  added: number;
  existing: number;
  failed: number;
  results: BulkResearchSourceResult[];
}
