import { Injectable, NotFoundException } from '@nestjs/common';
import type { ResearchSourceType, Signal } from '@content-os/contracts';
import { SignalRepository, SignalWithContext } from '@content-os/storage';

import { ListSignalsDto } from './dto/list-signals.dto';

@Injectable()
export class SignalService {
  constructor(private readonly signalRepository: SignalRepository) {}

  async findAll(query: ListSignalsDto): Promise<Signal[]> {
    const records = await this.signalRepository.findAll(
      query.projectId,
      query.researchSourceId,
    );

    return records.map((record) => this.toSignal(record));
  }

  async findOne(id: string): Promise<Signal> {
    const record = await this.signalRepository.findById(id);

    if (!record) {
      throw new NotFoundException('Signal not found');
    }

    return this.toSignal(record);
  }

  private toSignal(record: SignalWithContext): Signal {
    return {
      id: record.id,
      projectId: record.projectId,
      researchSourceId: record.researchSourceId,
      sourceType: record.sourceType as ResearchSourceType,
      externalId: record.externalId,
      title: record.title,
      url: record.url,
      summary: record.summary,
      publishedAt: record.publishedAt,
      discoveredAt: record.discoveredAt,
      createdAt: record.createdAt,
      project: {
        id: record.projectId,
        name: record.projectName,
      },
      sourceName: record.sourceName,
    };
  }
}
