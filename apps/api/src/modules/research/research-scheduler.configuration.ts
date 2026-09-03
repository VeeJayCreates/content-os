import { Injectable } from '@nestjs/common';

export type ResearchSchedulerConfiguration = {
  enabled: boolean;
  transcriptIntervalMs: number;
  transcriptsPerRun: number;
  manualRunEnabled: boolean;
};

const MINUTE_MS = 60_000;

/** Environment-backed operational policy for the small in-process Research scheduler. */
@Injectable()
export class ResearchSchedulerConfigurationService {
  readonly value: ResearchSchedulerConfiguration = {
    enabled: booleanEnvironment('RESEARCH_SCHEDULER_ENABLED', false),
    transcriptIntervalMs: minutesEnvironment('RESEARCH_TRANSCRIPT_INTERVAL_MINUTES', 10),
    transcriptsPerRun: boundedIntegerEnvironment('RESEARCH_TRANSCRIPTS_PER_RUN', 1, 1, 1),
    manualRunEnabled: booleanEnvironment('RESEARCH_SCHEDULER_MANUAL_ENABLED', process.env.NODE_ENV !== 'production'),
  };
}

function booleanEnvironment(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallback;
}

function minutesEnvironment(name: string, fallbackMinutes: number) {
  return boundedIntegerEnvironment(name, fallbackMinutes, 1, 24 * 60) * MINUTE_MS;
}

function boundedIntegerEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}
