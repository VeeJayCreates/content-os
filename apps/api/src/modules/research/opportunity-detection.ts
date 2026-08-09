import { ResearchSourceType } from '@content-os/contracts';

export type DetectionSignal = {
  id: string;
  projectId: string;
  title: string;
  url: string;
  summary: string | null;
  researchSourceId: string;
  sourceType: ResearchSourceType;
  discoveredAt: string;
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
]);
const GENERIC_WORDS = new Set([
  'ai',
  'election',
  'government',
  'india',
  'news',
  'update',
  'war',
]);
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com']);

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .join(' ');
}

export function clusterKey(signal: DetectionSignal): string {
  try {
    return `url:${normalizeUrl(signal.url)}`;
  } catch {
    return `title:${normalizeTitle(signal.title)}`;
  }
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';

  const identityParameters = identityQueryParameters(url);
  const entries = [...url.searchParams.entries()]
    .filter(([name]) => identityParameters.has(name))
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName
        ? leftValue.localeCompare(rightValue)
        : leftName.localeCompare(rightName),
    );
  url.search = new URLSearchParams(entries).toString();

  return url.toString();
}

function identityQueryParameters(url: URL): ReadonlySet<string> {
  if (YOUTUBE_HOSTS.has(url.hostname) && url.pathname === '/watch') {
    return new Set(['v']);
  }

  return new Set();
}

export function titleSimilarity(left: string, right: string): number {
  const leftWords = new Set(
    normalizeTitle(left)
      .split(' ')
      .filter((word) => word && !GENERIC_WORDS.has(word)),
  );
  const rightWords = new Set(
    normalizeTitle(right)
      .split(' ')
      .filter((word) => word && !GENERIC_WORDS.has(word)),
  );
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  const total = new Set([...leftWords, ...rightWords]).size;
  return total === 0 ? 0 : shared / total;
}

export function titlesMatch(left: string, right: string): boolean {
  const leftWords = normalizeTitle(left)
    .split(' ')
    .filter((word) => word && !GENERIC_WORDS.has(word));
  const rightWords = normalizeTitle(right)
    .split(' ')
    .filter((word) => word && !GENERIC_WORDS.has(word));
  return (
    leftWords.length >= 3 &&
    rightWords.length >= 3 &&
    titleSimilarity(left, right) >= 0.85
  );
}

export function scoreOpportunity(
  signals: DetectionSignal[],
  now = new Date(),
): number {
  const latest = Math.max(
    ...signals.map((signal) => new Date(signal.discoveredAt).getTime()),
  );
  const ageHours = Math.max(0, (now.getTime() - latest) / 3_600_000);
  const freshness = Math.max(0, 50 - Math.floor(ageHours / 12) * 5);
  const support = Math.min(25, (signals.length - 1) * 10);
  const sources = Math.min(
    25,
    (new Set(signals.map((signal) => signal.researchSourceId)).size - 1) * 12,
  );
  return Math.max(0, Math.min(100, 25 + freshness + support + sources));
}
