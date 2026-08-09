import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Opportunity, OpportunityDetail, OpportunityStatus } from '@content-os/contracts';
import { OpportunityRepository, OpportunityWithProject, ProjectRepository } from '@content-os/storage';

import { OpportunityDetectionService } from './opportunity-detection.service';

@Injectable()
export class OpportunityService {
  constructor(private readonly repository: OpportunityRepository, private readonly detection: OpportunityDetectionService, private readonly projects: ProjectRepository) {}

  async detect(projectId?: string) {
    if (projectId && !await this.projects.findById(projectId)) throw new NotFoundException('Project not found');
    return this.detection.detect(projectId);
  }
  async findAll(projectId?: string): Promise<Opportunity[]> { return (await this.repository.findAll(projectId)).map((record) => this.toOpportunity(record)); }
  async findOne(id: string): Promise<OpportunityDetail> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundException('Opportunity not found');
    const signals = (await this.repository.findSignalsByOpportunityIds([id])).get(id) ?? [];
    return { ...this.toOpportunity(record), signals: signals.map((signal) => ({ id: signal.id, title: signal.title, url: signal.url, summary: signal.summary, sourceName: signal.sourceName, discoveredAt: signal.discoveredAt })) };
  }
  async updateStatus(id: string, status: OpportunityStatus): Promise<Opportunity> {
    if (!await this.repository.findById(id)) throw new NotFoundException('Opportunity not found');
    try { return this.toOpportunity((await this.repository.update(id, { status }))!); } catch { throw new InternalServerErrorException('Unable to update opportunity status'); }
  }
  private toOpportunity(record: OpportunityWithProject): Opportunity { return { id: record.id, projectId: record.projectId, project: { id: record.projectId, name: record.projectName }, title: record.title, representativeUrl: record.representativeUrl, summary: record.summary, status: record.status as OpportunityStatus, score: record.score, signalCount: record.signalCount, sourceCount: record.sourceCount, firstSeenAt: record.firstSeenAt, lastSeenAt: record.lastSeenAt, createdAt: record.createdAt, updatedAt: record.updatedAt }; }
}
