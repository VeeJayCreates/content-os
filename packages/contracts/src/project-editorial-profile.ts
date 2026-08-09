import { EditorialTimelinessPreference } from './enums.js';

export interface ProjectEditorialProfile {
  projectId: string;
  mission: string;
  targetAudience: string;
  primaryLanguage: string;
  primaryGeography: string;
  topicThemes: string[];
  excludedTopics: string[];
  contentGoals: string[];
  preferredFormats: string[];
  timelinessPreference: EditorialTimelinessPreference;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectEditorialProfileUpdateInput {
  mission?: string;
  targetAudience?: string;
  primaryLanguage?: string;
  primaryGeography?: string;
  topicThemes?: string[];
  excludedTopics?: string[];
  contentGoals?: string[];
  preferredFormats?: string[];
  timelinessPreference?: EditorialTimelinessPreference;
}
