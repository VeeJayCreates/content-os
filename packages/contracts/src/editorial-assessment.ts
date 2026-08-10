import { EditorialAssessmentBand, EditorialAssessmentLongevity, EditorialAssessmentRecommendation, EditorialAssessmentStatus } from './enums.js';

export interface EditorialAssessment {
  id: string; projectId: string; opportunityId: string; projectEditorialProfileRevision: number; opportunityMetricsVersion: string; researchPackageId: string; researchPackageUpdatedAt: string; status: EditorialAssessmentStatus;
  relevance: EditorialAssessmentBand | null; newsworthiness: EditorialAssessmentBand | null; contentPotential: EditorialAssessmentBand | null; longevity: EditorialAssessmentLongevity | null; duplicationRisk: EditorialAssessmentBand | null; recommendation: EditorialAssessmentRecommendation | null; editorialScore: number | null; rationale: string | null; citedFactIds: string[]; citedSignalIds: string[];
  evaluatorProvider: string | null; evaluatorModel: string | null; promptVersion: string; inputHash: string; errorCode: string | null; failureReason: string | null; assessedAt: string | null; createdAt: string; updatedAt: string;
}
