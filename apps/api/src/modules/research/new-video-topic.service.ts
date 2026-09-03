import { createHash } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { ResearchSourceType } from '@content-os/contracts';
import { OpportunityRepository, SignalRepository, type OpportunityWithProject } from '@content-os/storage';

import { normalizeTitle, scoreOpportunity, titleSimilarity, type DetectionSignal } from './opportunity-detection';
import { extractTopicCandidates } from './topic-candidate-extraction';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { SemanticTopicClusteringService } from './semantic-topic-clustering.service';
import { EventCoreferenceService } from './event-coreference.service';

const RECENT_TOPIC_CANDIDATE_LIMIT = 100;
const CONSERVATIVE_TITLE_SIMILARITY = 0.85;

export type NewVideoTopicFailure = { signalId: string; category: string };
export type NewVideoTopicResult = {
  newVideosProcessed: number;
  topicsCreated: number;
  videosJoinedToExistingTopic: number;
  duplicateNoops: number;
  linksCreated: number;
  failures: NewVideoTopicFailure[];
  mappings: Array<{ signalId: string; videoId: string; topicId: string; decision: 'created' | 'joined' | 'duplicate' }>;
};

/**
 * The incremental topic boundary. It only receives explicit new video signal
 * IDs. It performs only a bounded, conservative semantic comparison against
 * recent topics after its deterministic exact-title path has found no match.
 */
@Injectable()
export class NewVideoTopicService {
  constructor(
  private readonly signals: SignalRepository,
  private readonly opportunities: OpportunityRepository,
  private readonly semanticClustering: SemanticTopicClusteringService,
  private readonly eventCoreference: EventCoreferenceService,
  @Optional() private readonly executionLog?: ResearchExecutionLogger,
) {}

  async process(projectId: string, requestedSignalIds: string[]): Promise<NewVideoTopicResult> {
    const signalIds = [...new Set(requestedSignalIds)];
    return this.executionLog?.withRun(projectId, async () => this.processSignals(projectId, signalIds))
      ?? this.processSignals(projectId, signalIds);
  }

  private async processSignals(projectId: string, signalIds: string[]): Promise<NewVideoTopicResult> {
    const startedAt = Date.now();
    const result: NewVideoTopicResult = {
      newVideosProcessed: 0,
      topicsCreated: 0,
      videosJoinedToExistingTopic: 0,
      duplicateNoops: 0,
      linksCreated: 0,
      failures: [],
      mappings: [],
    };
    this.log(projectId, 'info', 'new_video_topic_processing.started', 'started', {
      requestedSignalCount: signalIds.length,
      recentTopicCandidateLimit: RECENT_TOPIC_CANDIDATE_LIMIT,
    });

    // Fresh ingestion prior to the canonical provider adapter persisted raw IDs.
    // Normalize only explicitly requested YouTube signals; Topic eligibility stays strict.
    await this.signals.normalizeYouTubeExternalIds(signalIds);
    const recentTopics = await this.opportunities.findRecentByProject(projectId, RECENT_TOPIC_CANDIDATE_LIMIT);
    for (const signalId of signalIds) {
      try {
        const signal = await this.signals.findById(signalId);
        if (!signal || signal.projectId !== projectId || signal.sourceType !== ResearchSourceType.YOUTUBE || !youtubeVideoId(signal.externalId)) {
          throw new Error('ineligible_new_video_signal');
        }

        const videoId = youtubeVideoId(signal.externalId)!;
        const topic = deriveTopic(signal.title);
        this.log(projectId, 'info', 'new_video_topic_processing.video.normalized', 'completed', {
          signalId,
          videoId,
          normalizedTopic: topic.normalizedTitle,
        });
        const candidates = recentTopics.filter((candidate) => candidate.clusterKey === topic.clusterKey || conservativelyMatches(topic, candidate));
        let opportunity = candidates[0] ?? await this.findSemanticMatch(projectId, signalId, topic, recentTopics);
        let decision: 'created' | 'joined' | 'duplicate';

        if (!opportunity) {
          opportunity = await this.opportunities.create({
            projectId,
            clusterKey: topic.clusterKey,
            title: topic.title,
            representativeUrl: signal.url,
            summary: signal.summary,
            // A single competitor video is a valid detected topic. Evidence
            // strength and content-potential gates are downstream concerns.
            status: 'detected',
            score: scoreOpportunity([toDetectionSignal(signal)]),
            signalCount: 1,
            sourceCount: 1,
            firstSeenAt: signal.discoveredAt,
            lastSeenAt: signal.discoveredAt,
          });
          recentTopics.unshift(opportunity);
          result.topicsCreated += 1;
          decision = 'created';
          this.log(projectId, 'info', 'new_video_topic_processing.topic.persisted', 'created', {
            signalId, videoId, opportunityId: opportunity.id, candidateTopicCount: candidates.length,
          });
        } else {
          decision = 'joined';
          this.log(projectId, 'info', 'new_video_topic_processing.topic.decision', 'joined', {
            signalId, videoId, opportunityId: opportunity.id, candidateTopicCount: candidates.length,
          });
        }

        const linkCreated = await this.opportunities.attachSignal(opportunity.id, signal.id);
        if (!linkCreated) {
          result.duplicateNoops += 1;
          decision = 'duplicate';
          this.log(projectId, 'debug', 'new_video_topic_processing.source_link', 'duplicate_skipped', {
            signalId, videoId, opportunityId: opportunity.id,
          });
        } else {
          result.linksCreated += 1;
          if (decision === 'joined') {
            result.videosJoinedToExistingTopic += 1;
            await this.recalculateAggregate(opportunity.id);
          }
          this.log(projectId, 'info', 'new_video_topic_processing.source_link', 'created', {
            signalId, videoId, opportunityId: opportunity.id,
          });
        }
        result.newVideosProcessed += 1;
        result.mappings.push({ signalId, videoId, topicId: opportunity.id, decision });
      } catch (error) {
        result.failures.push({ signalId, category: safeFailureCategory(error) });
        this.log(projectId, 'warn', 'new_video_topic_processing.video', 'failed', {
          signalId, failureCategory: safeFailureCategory(error),
        });
      }
    }
    this.log(projectId, 'info', 'new_video_topic_processing.completed', 'completed', result, Date.now() - startedAt);
    return result;
  }

  private async recalculateAggregate(opportunityId: string) {
    const signals = (await this.opportunities.findSignalsByOpportunityIds([opportunityId])).get(opportunityId) ?? [];
    if (signals.length === 0) return;
    const records = signals.map(toDetectionSignal);
    const first = records.reduce((left, item) => item.discoveredAt < left ? item.discoveredAt : left, records[0]!.discoveredAt);
    const last = records.reduce((left, item) => item.discoveredAt > left ? item.discoveredAt : left, records[0]!.discoveredAt);
    await this.opportunities.update(opportunityId, {
      score: scoreOpportunity(records),
      signalCount: records.length,
      sourceCount: new Set(records.map((item) => item.researchSourceId)).size,
      firstSeenAt: first,
      lastSeenAt: last,
    });
  }

  private async findSemanticMatch(
    projectId: string,
    signalId: string,
    topic: ReturnType<typeof deriveTopic>,
    recentTopics: OpportunityWithProject[],
  ): Promise<OpportunityWithProject | undefined> {
    const existingCandidates = recentTopics.map((candidate) => {
      const canonical = deriveTopic(candidate.title);

      return {
        id: candidate.id,
        projectId,
        text: canonical.title,
        normalizedText: canonical.normalizedTitle,
      };
    });

    const retrieved = await this.semanticClustering.retrieveBestCandidates(
      {
        id: signalId,
        projectId,
        text: topic.title,
        normalizedText: topic.normalizedTitle,
      },
      existingCandidates,
      5,
    );

    if (retrieved.length === 0) {
      return undefined;
    }

    const candidateMap = new Map(
      recentTopics.map((candidate) => [candidate.id, candidate]),
    );

    const eventCandidates = retrieved
      .map((match) => {
        const candidate = candidateMap.get(match.candidateId);

        if (!candidate) {
          return null;
        }

        const canonical = deriveTopic(candidate.title);

        return {
          id: candidate.id,
          title: canonical.title,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          id: string;
          title: string;
        } => candidate !== null,
      );

    if (eventCandidates.length === 0) {
      return undefined;
    }

    const result = await this.eventCoreference.compareCandidates(
      topic.title,
      eventCandidates,
    );

    // Provider unavailable / invalid response:
    // conservative false split instead of dangerous false merge.
    if (!result?.matchedCandidateId) {
      this.log(
        projectId,
        'debug',
        'new_video_topic_processing.semantic_decision',
        'no_match',
        {
          signalId,
          candidateCount: eventCandidates.length,
          eventReason: result?.reason ?? 'provider_unavailable',
        },
      );

      return undefined;
    }

    const matchedCandidate = candidateMap.get(result.matchedCandidateId);

    if (!matchedCandidate) {
      return undefined;
    }

    const retrievedMatch = retrieved.find(
      (match) => match.candidateId === matchedCandidate.id,
    );

    this.log(
      projectId,
      'info',
      'new_video_topic_processing.semantic_decision',
      'joined',
      {
        signalId,
        opportunityId: matchedCandidate.id,
        similarity: retrievedMatch?.similarity,
        eventDecision: 'SAME_EVENT',
        eventReason: result.reason,
        candidatesEvaluated: eventCandidates.length,
      },
    );

    return matchedCandidate;
  }

  private log(projectId: string, level: 'debug' | 'info' | 'warn', event: string, status: string, result: Record<string, unknown>, durationMs?: number) {
    this.executionLog?.withContext({ projectId }, () => this.executionLog?.event(level, event, status, { result, durationMs }));
  }
}

function deriveTopic(title: string) {
  const candidate = extractTopicCandidates(title)[0]?.text ?? title.trim();
  const normalizedTitle = normalizeTitle(candidate);
  const identity = normalizedTitle || normalizeTitle(title) || 'untitled-video';
  return {
    title: candidate || 'Untitled competitor video',
    normalizedTitle: identity,
    clusterKey: `new-video-topic:${createHash('sha256').update(identity).digest('hex')}`,
  };
}

function conservativelyMatches(topic: ReturnType<typeof deriveTopic>, candidate: OpportunityWithProject) {
  return normalizeTitle(candidate.title) === topic.normalizedTitle
    || (topic.normalizedTitle.split(' ').filter(Boolean).length >= 3
      && titleSimilarity(topic.title, candidate.title) >= CONSERVATIVE_TITLE_SIMILARITY);
}

function youtubeVideoId(externalId: string) {
  return externalId.startsWith('youtube:') ? externalId.slice('youtube:'.length) || null : null;
}

function toDetectionSignal(signal: { id: string; projectId: string; title: string; url: string; summary: string | null; researchSourceId: string; sourceType: string; discoveredAt: string }): DetectionSignal {
  return { ...signal, sourceType: signal.sourceType as ResearchSourceType };
}

function safeFailureCategory(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 80) : 'unknown_failure';
}
