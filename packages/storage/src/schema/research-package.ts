import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const researchPackages = sqliteTable(
  "research_packages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    opportunityId: text("opportunity_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    status: text("status").notNull(),
    confidenceScore: integer("confidence_score").notNull(),
    sourceCount: integer("source_count").notNull(),
    signalCount: integer("signal_count").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("research_packages_opportunity_unique").on(table.opportunityId),
  ],
);

export const researchFacts = sqliteTable(
  "research_facts",
  {
    id: text("id").primaryKey(),
    researchPackageId: text("research_package_id").notNull(),
    claim: text("claim").notNull(),
    normalizedClaimKey: text("normalized_claim_key").notNull(),
    confidence: integer("confidence").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("research_facts_package_claim_key_unique").on(
      table.researchPackageId,
      table.normalizedClaimKey,
    ),
  ],
);

export const researchFactEvidence = sqliteTable(
  "research_fact_evidence",
  {
    researchFactId: text("research_fact_id").notNull(),
    signalId: text("signal_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("research_fact_evidence_fact_signal_unique").on(
      table.researchFactId,
      table.signalId,
    ),
  ],
);

export type ResearchPackage = typeof researchPackages.$inferSelect;
export type NewResearchPackage = typeof researchPackages.$inferInsert;
export type ResearchFact = typeof researchFacts.$inferSelect;
export type NewResearchFact = typeof researchFacts.$inferInsert;
