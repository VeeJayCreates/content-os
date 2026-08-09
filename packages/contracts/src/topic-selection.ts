import { TopicSelectionDecision } from "./enums.js";

export interface ProjectSelectionPolicy { projectId: string; minimumOpportunityScore: number; minimumResearchConfidence: number; minimumIndependentSources: number; maxSelectedPerRun: number; requireResearchPackage: boolean; allowSingleSourceBreakingStories: boolean; createdAt: string; updatedAt: string; }
export interface TopicSelectionProjectContext { id: string; name: string; }
export interface TopicSelectionOpportunityContext { id: string; title: string; score: number; representativeUrl: string; }
export interface TopicSelectionResearchPackageContext { id: string; confidenceScore: number; sourceCount: number; status: string; }
export interface TopicSelection { id: string; projectId: string; opportunityId: string; researchPackageId: string | null; opportunityTitle: string; project: TopicSelectionProjectContext; opportunity: TopicSelectionOpportunityContext; researchPackage: TopicSelectionResearchPackageContext | null; decision: TopicSelectionDecision; selectionScore: number; reason: string; evaluatedAt: string; createdAt: string; updatedAt: string; }
export interface TopicSelectionEvaluationResult { opportunitiesEvaluated: number; selectedCount: number; holdCount: number; rejectedCount: number; decisionsUpdated: number; warnings: string[]; }
