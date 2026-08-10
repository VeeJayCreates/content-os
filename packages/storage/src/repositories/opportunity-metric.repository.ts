import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db.js';
import {
  NewOpportunityMetric,
  OpportunityMetric,
  opportunityMetrics,
} from '../schema/opportunity-metrics.js';

export class OpportunityMetricRepository {
  async findByOpportunityId(
    opportunityId: string,
    scoreVersion: string,
  ): Promise<OpportunityMetric | undefined> {
    const rows = await db
      .select()
      .from(opportunityMetrics)
      .where(
        and(
          eq(opportunityMetrics.opportunityId, opportunityId),
          eq(opportunityMetrics.scoreVersion, scoreVersion),
        ),
      );

    return rows[0];
  }

  async findByOpportunityIds(
    opportunityIds: string[],
    scoreVersion: string,
  ): Promise<Map<string, OpportunityMetric>> {
    if (opportunityIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select()
      .from(opportunityMetrics)
      .where(
        and(
          inArray(opportunityMetrics.opportunityId, opportunityIds),
          eq(opportunityMetrics.scoreVersion, scoreVersion),
        ),
      );

    return new Map(rows.map((metric) => [metric.opportunityId, metric]));
  }

  async upsert(
    data: Omit<NewOpportunityMetric, 'id'>,
  ): Promise<OpportunityMetric> {
    const metric: NewOpportunityMetric = { id: randomUUID(), ...data };
    await db
      .insert(opportunityMetrics)
      .values(metric)
      .onConflictDoUpdate({
        target: [
          opportunityMetrics.opportunityId,
          opportunityMetrics.scoreVersion,
        ],
        set: data,
      });

    const stored = await this.findByOpportunityId(
      data.opportunityId,
      data.scoreVersion,
    );
    if (!stored) {
      throw new Error('Unable to persist opportunity metrics');
    }
    return stored;
  }

  async upsertMany(data: Omit<NewOpportunityMetric, 'id'>[]): Promise<void> {
    if (data.length === 0) return;
    db.transaction((tx) => {
      for (const entry of data) {
        const metric: NewOpportunityMetric = { id: randomUUID(), ...entry };
        tx.insert(opportunityMetrics).values(metric).onConflictDoUpdate({ target: [opportunityMetrics.opportunityId, opportunityMetrics.scoreVersion], set: entry }).run();
      }
    });
  }
}
