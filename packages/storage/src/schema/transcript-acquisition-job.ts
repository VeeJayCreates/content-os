import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const transcriptAcquisitionJobs = sqliteTable('transcript_acquisition_jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  signalId: text('signal_id').notNull(),
  version: text('version').notNull(),
  status: text('status').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: text('next_attempt_at'),
  lastAttemptAt: text('last_attempt_at'),
  failureClassification: text('failure_classification'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('transcript_acquisition_jobs_signal_version_unique').on(table.signalId, table.version),
  index('transcript_acquisition_jobs_claim_idx').on(table.projectId, table.status, table.nextAttemptAt),
]);

export type TranscriptAcquisitionJob = typeof transcriptAcquisitionJobs.$inferSelect;
