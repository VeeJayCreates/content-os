import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { aiExecutions, type AiExecution, type NewAiExecution } from '../schema/ai-execution.js';

export class AiExecutionRepository {
  async create(data: Omit<NewAiExecution, 'id' | 'createdAt'>): Promise<AiExecution> {
    const row: NewAiExecution = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
    };
    await db.insert(aiExecutions).values(row);
    return row as AiExecution;
  }
}
